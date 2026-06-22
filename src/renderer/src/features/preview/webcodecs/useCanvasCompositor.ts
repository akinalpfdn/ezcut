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
import { previewNeedsProxy } from '../../../utils/proxyPolicy'

interface ClipRef {
  clipId: string
  fileUrl: string
  sourceUs: number
}

/**
 * Drives video preview: a Web Worker owns the OffscreenCanvas and does all
 * demux/decode/draw, so the main thread stays responsive. Each frame the main
 * thread only reads the stores, resolves which clip/url/time to show (proxy when
 * needed), and posts that small state to the worker. The audio engine is the clock.
 */
export function useCanvasCompositor(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Created once and kept for the app's lifetime: a canvas can only be
    // transferred to an offscreen context a single time (survives StrictMode's
    // double-invoke, which only cancels/restarts the rAF below).
    if (!workerRef.current) {
      const worker = new Worker(new URL('./compositorWorker.ts', import.meta.url), { type: 'module' })
      const offscreen = canvas.transferControlToOffscreen()
      worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])
      workerRef.current = worker
    }
    const worker = workerRef.current

    // The decode url for a clip's media: the proxy when one is needed, else the
    // original. Returns null while a needed proxy is still generating.
    const sourceUrlFor = (media: MediaItem): string | null => {
      if (!previewNeedsProxy(media)) return toMediaUrl(media.path)
      const proxy = useProxyStore.getState().getProxyPath(media.path)
      if (proxy) return toMediaUrl(proxy)
      useProxyStore.getState().ensureProxy(media.path, media.durationSeconds)
      return null
    }

    let rafId: number | null = null
    const render = (): void => {
      const { model, playheadTime } = useTimelineStore.getState()
      const items = useMediaStore.getState().items
      const videoTrack = getTracksSorted(model).find((track) => track.kind === 'video')

      let hasActiveClip = false
      let active: ClipRef | null = null
      let next: ClipRef | null = null
      let fallbackUrl: string | null = null

      if (videoTrack) {
        const clips = getTrackClips(model, videoTrack.id)
        const activeIndex = clips.findIndex(
          (clip) => playheadTime >= clip.startOnTimeline && playheadTime < clipTimelineEnd(clip)
        )
        const activeClip = activeIndex >= 0 ? clips[activeIndex] : undefined
        const nextClip =
          activeIndex >= 0 ? clips[activeIndex + 1] : clips.find((clip) => clip.startOnTimeline > playheadTime)

        if (activeClip) {
          hasActiveClip = true
          const media = items.find((item) => item.id === activeClip.mediaId)
          if (media) {
            fallbackUrl = media.thumbnailPath ? toMediaUrl(media.thumbnailPath) : null
            const url = sourceUrlFor(media)
            if (url) {
              const sourceUs = Math.max(0, timelineTimeToSource(activeClip, playheadTime)) * 1_000_000
              active = { clipId: activeClip.id, fileUrl: url, sourceUs }
            }
          }
        }

        if (nextClip) {
          const media = items.find((item) => item.id === nextClip.mediaId)
          const url = media ? sourceUrlFor(media) : null
          if (url) next = { clipId: nextClip.id, fileUrl: url, sourceUs: Math.max(0, nextClip.sourceIn) * 1_000_000 }
        }
      }

      worker.postMessage({ type: 'render', hasActiveClip, active, next, fallbackUrl })
      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [canvasRef])
}
