import { useEffect, useRef, type RefObject } from 'react'
import {
  clipTimelineEnd,
  getClipTransition,
  getTrackClips,
  getTracksSorted,
  timelineTimeToSource,
  type MediaItem,
  type TransitionType
} from '@shared'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useTransportStore } from '../../../stores/transportStore'
import { useMediaStore } from '../../../stores/mediaStore'
import { useProxyStore } from '../../../stores/proxyStore'
import { toMediaUrl } from '../../../utils/mediaUrl'
import { previewNeedsProxy } from '../../../utils/proxyPolicy'
import { animState } from '../textAnimation'

interface ClipRef {
  clipId: string
  fileUrl: string
  sourceUs: number
}

interface TransitionRef extends ClipRef {
  transitionType: TransitionType
  progress: number
}

/**
 * Drives video preview: a Web Worker owns the OffscreenCanvas and does all
 * demux/decode/draw, so the main thread stays responsive. Each frame the main
 * thread only reads the stores, resolves which clip/url/time to show (proxy when
 * needed), and posts that small state to the worker. The audio engine is the clock.
 */
export function useCanvasCompositor(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  /** Receives the live frame dimensions from the worker, for letterbox-aware
   * pointer mapping (text drag-to-position). */
  frameSizeRef?: RefObject<{ width: number; height: number }>
): void {
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
      worker.onmessage = (event: MessageEvent<{ type: 'size'; width: number; height: number }>): void => {
        if (event.data?.type === 'size' && frameSizeRef?.current) {
          frameSizeRef.current = { width: event.data.width, height: event.data.height }
        }
      }
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

    // Only recompute when something relevant changed: playback advances the
    // playhead (a timeline-store change) every frame, edits change the model/
    // items, and a proxy becoming ready changes the proxy store. While truly idle
    // (paused, no edits) the render loop does no per-frame work at all.
    let dirty = true
    const markDirty = (): void => {
      dirty = true
    }
    const unsubscribers = [
      useTimelineStore.subscribe(markDirty),
      useTransportStore.subscribe(markDirty),
      useMediaStore.subscribe(markDirty),
      useProxyStore.subscribe(markDirty)
    ]

    let rafId: number | null = null
    let lastSig = ''
    const render = (): void => {
      if (!dirty) {
        rafId = requestAnimationFrame(render)
        return
      }
      dirty = false
      const model = useTimelineStore.getState().model
      const playheadTime = useTransportStore.getState().playheadTime
      const items = useMediaStore.getState().items
      const videoTrack = getTracksSorted(model).find((track) => track.kind === 'video')

      const texts = model.textOverlays
        .filter((overlay) => playheadTime >= overlay.start && playheadTime < overlay.start + overlay.duration)
        .map((overlay) => {
          const anim = animState(
            overlay.animationIn,
            overlay.animationOut,
            overlay.animInDuration,
            overlay.animOutDuration,
            playheadTime - overlay.start,
            overlay.start + overlay.duration - playheadTime
          )
          return {
            text: overlay.text,
            x: overlay.x,
            y: overlay.y,
            fontSize: overlay.fontSize,
            color: overlay.color,
            background: overlay.background,
            fontFamily: overlay.fontFamily,
            align: overlay.align,
            bold: overlay.bold,
            italic: overlay.italic,
            outlineColor: overlay.outlineColor,
            outlineWidth: overlay.outlineWidth,
            boxColor: overlay.boxColor,
            boxOpacity: overlay.boxOpacity,
            boxRadius: overlay.boxRadius,
            boxPadding: overlay.boxPadding,
            opacity: overlay.opacity,
            rotation: overlay.rotation,
            glow: overlay.glow,
            glowColor: overlay.glowColor,
            glowStrength: overlay.glowStrength,
            animAlpha: anim.alpha,
            animDx: anim.dx,
            animDy: anim.dy,
            animScale: anim.scale,
            animReveal: anim.reveal
          }
        })

      let hasActiveClip = false
      let active: ClipRef | null = null
      let next: ClipRef | null = null
      let transition: TransitionRef | null = null
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
          if (media && media.kind === 'image') {
            // Still image: drawn straight from the file (worker's image path), no
            // decode source. Leaving `active` null makes the worker draw fallbackUrl.
            fallbackUrl = toMediaUrl(media.path)
          } else if (media) {
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
          // Images aren't prefetched (they'd fail the video demux and load instantly anyway).
          const url = media && media.kind !== 'image' ? sourceUrlFor(media) : null
          if (url) next = { clipId: nextClip.id, fileUrl: url, sourceUs: Math.max(0, nextClip.sourceIn) * 1_000_000 }
        }

        // Inside a crossfade overlap: blend the incoming clip over the active one.
        const xfade = activeClip ? getClipTransition(model, activeClip) : null
        if (xfade && playheadTime >= xfade.next.startOnTimeline) {
          const media = items.find((item) => item.id === xfade.next.mediaId)
          const url = media && media.kind !== 'image' ? sourceUrlFor(media) : null
          if (url) {
            const progress = Math.min(1, Math.max(0, (playheadTime - xfade.next.startOnTimeline) / xfade.duration))
            const sourceUs = Math.max(0, timelineTimeToSource(xfade.next, playheadTime)) * 1_000_000
            transition = { clipId: xfade.next.id, fileUrl: url, sourceUs, transitionType: xfade.type, progress }
          }
        }
      }

      // Only post when the resolved render state actually changed — during
      // playback sourceUs advances every frame (so it posts, as needed), but
      // while paused/idle this skips the per-frame structured-clone to the worker.
      const textsSig = texts
        .map(
          (t) =>
            `${t.text}|${t.x}|${t.y}|${t.fontSize}|${t.color}|${t.background}|${t.fontFamily}|${t.align}|${t.bold}|${t.italic}|${t.outlineColor}|${t.outlineWidth}|${t.boxColor}|${t.boxOpacity}|${t.boxRadius}|${t.boxPadding}|${t.opacity}|${t.rotation}|${t.glow}|${t.glowColor}|${t.glowStrength}|${t.animAlpha.toFixed(3)}|${t.animDx.toFixed(4)}|${t.animDy.toFixed(4)}|${t.animScale.toFixed(3)}|${t.animReveal.toFixed(3)}`
        )
        .join('~')
      const sig = `${hasActiveClip}|${active?.clipId ?? ''}|${active?.fileUrl ?? ''}|${active?.sourceUs ?? ''}|${next?.clipId ?? ''}|${next?.fileUrl ?? ''}|${next?.sourceUs ?? ''}|${fallbackUrl ?? ''}|${transition?.clipId ?? ''}|${transition?.sourceUs ?? ''}|${transition?.transitionType ?? ''}|${transition?.progress ?? ''}|${textsSig}`
      if (sig !== lastSig) {
        lastSig = sig
        worker.postMessage({ type: 'render', hasActiveClip, active, next, transition, texts, fallbackUrl })
      }
      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [canvasRef])
}
