import { useEffect, useRef, type RefObject } from 'react'
import {
  clipTimelineEnd,
  getTrackClips,
  getTracksSorted,
  timelineTimeToSource,
  type MediaItem
} from '@shared'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useMediaStore } from '../../../stores/mediaStore'
import { useProxyStore } from '../../../stores/proxyStore'
import { toMediaUrl } from '../../../utils/mediaUrl'
import { ClipVideoSource } from './clipVideoSource'

/**
 * Draws the timeline's video onto a canvas via WebCodecs, reading the shared
 * playhead (the audio engine is the clock). Keeps the active clip's source plus a
 * decode-ahead source for the next clip so boundary crossings are gapless.
 * Heavy/unsupported sources decode from a preview proxy; until a proxy is ready
 * the clip's thumbnail is drawn as a placeholder rather than a black frame.
 */
export function useCanvasCompositor(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const sourcesRef = useRef(new Map<string, ClipVideoSource>())
  const loadingRef = useRef(new Set<string>())
  const thumbsRef = useRef(new Map<string, HTMLImageElement>())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sources = sourcesRef.current
    const loading = loadingRef.current
    const thumbs = thumbsRef.current
    let rafId: number | null = null

    // The url to decode for a clip's media: the proxy when one is needed, the
    // original otherwise. Returns null while a needed proxy is still generating.
    const sourceUrlFor = (media: MediaItem): string | null => {
      if (!media.needsProxy) return toMediaUrl(media.path)
      const proxy = useProxyStore.getState().getProxyPath(media.path)
      if (proxy) return toMediaUrl(proxy)
      useProxyStore.getState().ensureProxy(media.path)
      return null
    }

    const ensureSource = (clipId: string, fileUrl: string): ClipVideoSource | null => {
      const existing = sources.get(clipId)
      if (existing) return existing
      if (loading.has(clipId)) return null
      loading.add(clipId)
      const source = new ClipVideoSource()
      source
        .load(fileUrl)
        .then(() => {
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

    // Placeholder while a proxy generates: the clip's thumbnail, or black.
    const drawFallback = (media: MediaItem): void => {
      if (!media.thumbnailPath) {
        clearCanvas()
        return
      }
      let img = thumbs.get(media.id)
      if (!img) {
        img = new Image()
        img.src = toMediaUrl(media.thumbnailPath)
        thumbs.set(media.id, img)
      }
      if (img.complete && img.naturalWidth > 0) {
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      } else {
        clearCanvas()
      }
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
        const next =
          activeIndex >= 0 ? clips[activeIndex + 1] : clips.find((clip) => clip.startOnTimeline > playheadTime)

        if (active) {
          keep.add(active.id)
          const media = items.find((item) => item.id === active.mediaId)
          const url = media ? sourceUrlFor(media) : null
          if (media && url) {
            const source = ensureSource(active.id, url)
            if (source?.isLoaded) {
              const sourceUs = Math.max(0, timelineTimeToSource(active, playheadTime)) * 1_000_000
              const frame = source.frameAt(sourceUs)
              if (frame) drawFrame(frame)
              // else keep the last drawn frame while decoding (no black flash)
            }
          } else if (media) {
            // Proxy still generating — show the thumbnail placeholder.
            drawFallback(media)
          }
        } else {
          clearCanvas()
        }

        if (next) {
          keep.add(next.id)
          const media = items.find((item) => item.id === next.mediaId)
          const url = media ? sourceUrlFor(media) : null
          if (url) {
            const source = ensureSource(next.id, url)
            if (source?.isLoaded) source.prefetch(Math.max(0, next.sourceIn) * 1_000_000)
          }
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
      thumbs.clear()
    }
  }, [canvasRef])
}
