import { useEffect, useRef, type RefObject } from 'react'
import { clipTimelineEnd, getTrackClips, getTracksSorted, timelineTimeToSource } from '@shared'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useMediaStore } from '../../../stores/mediaStore'
import { toMediaUrl } from '../../../utils/mediaUrl'
import { ClipVideoSource } from './clipVideoSource'

/**
 * Draws the timeline's video onto a canvas via WebCodecs, reading the shared
 * playhead (the element audio engine remains the clock). Keeps the active clip's
 * source plus a decode-ahead source for the next clip so boundary crossings are
 * gapless. Does not mutate the model.
 */
export function useCanvasCompositor(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const sourcesRef = useRef(new Map<string, ClipVideoSource>())
  const loadingRef = useRef(new Set<string>())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sources = sourcesRef.current
    const loading = loadingRef.current
    let rafId: number | null = null
    let firstFrameLogged = false

    const ensureSource = (clipId: string, fileUrl: string): ClipVideoSource | null => {
      const existing = sources.get(clipId)
      if (existing) return existing
      if (loading.has(clipId)) return null
      loading.add(clipId)
      console.log('[compositor] loading clip', clipId, fileUrl)
      const source = new ClipVideoSource()
      source
        .load(fileUrl)
        .then(() => {
          console.log('[compositor] loaded clip', clipId, 'durationUs', source.durationUs)
          sources.set(clipId, source)
          loading.delete(clipId)
        })
        .catch((error) => {
          console.error('[compositor] clip load failed', clipId, error)
          loading.delete(clipId)
          source.dispose()
        })
      return null
    }

    const clearCanvas = (): void => {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    const drawFrame = (frame: VideoFrame): void => {
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth
        canvas.height = frame.displayHeight
      }
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
    }

    const render = (): void => {
      const { model, playheadTime } = useTimelineStore.getState()
      const items = useMediaStore.getState().items
      const videoTrack = getTracksSorted(model).find((track) => track.kind === 'video')
      const keep = new Set<string>()

      if (videoTrack) {
        const clips = getTrackClips(model, videoTrack.id)
        const activeIndex = clips.findIndex(
          (clip) => playheadTime >= clip.startOnTimeline && playheadTime < clipTimelineEnd(clip)
        )
        const active = activeIndex >= 0 ? clips[activeIndex] : undefined
        const next = activeIndex >= 0 ? clips[activeIndex + 1] : clips.find((clip) => clip.startOnTimeline > playheadTime)

        if (active) {
          keep.add(active.id)
          const media = items.find((item) => item.id === active.mediaId)
          const source = media ? ensureSource(active.id, toMediaUrl(media.path)) : null
          if (source?.isLoaded) {
            const sourceUs = Math.max(0, timelineTimeToSource(active, playheadTime)) * 1_000_000
            const frame = source.frameAt(sourceUs)
            if (frame) {
              drawFrame(frame)
              if (!firstFrameLogged) {
                console.log('[compositor] first frame drawn', frame.displayWidth, 'x', frame.displayHeight)
                firstFrameLogged = true
              }
            }
          }
          // While the active clip is still loading, keep the last drawn frame
          // (avoids a black flash); a true gap clears below.
        } else {
          clearCanvas()
        }

        if (next) {
          keep.add(next.id)
          const media = items.find((item) => item.id === next.mediaId)
          const source = media ? ensureSource(next.id, toMediaUrl(media.path)) : null
          if (source?.isLoaded) source.prefetch(Math.max(0, next.sourceIn) * 1_000_000)
        }
      } else {
        clearCanvas()
      }

      for (const [clipId, source] of sources) {
        if (!keep.has(clipId)) {
          source.dispose()
          sources.delete(clipId)
        }
      }

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      for (const source of sources.values()) source.dispose()
      sources.clear()
      loading.clear()
    }
  }, [canvasRef])
}
