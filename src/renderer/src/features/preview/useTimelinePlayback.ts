import { useCallback, useEffect, useRef } from 'react'
import {
  type Clip,
  type MediaItem,
  clipTimelineEnd,
  getTrackClips,
  timelineDuration,
  timelineTimeToSource
} from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { useDenoiseStore } from '../../stores/denoiseStore'
import { toMediaUrl } from '../../utils/mediaUrl'
import { DRIFT_TOLERANCE_SECONDS } from '../../config/playback'

interface AudioGraph {
  context: AudioContext
  master: GainNode
  gains: Map<HTMLMediaElement, GainNode>
}

/** Registration key for a video track's denoised-audio element. */
export function denoiseElementKey(trackId: string): string {
  return `denoise:${trackId}`
}

/** Registration key for the second (preload) slot of a video track. */
export function videoSlotBKey(trackId: string): string {
  return `${trackId}::b`
}

/**
 * The timeline playback engine. A requestAnimationFrame master clock advances
 * the store playhead; each track's media element is matched to the clip active
 * at that time and drift-corrected to it. All element audio is mixed through one
 * Web Audio graph (per-clip gain → master → destination). Reads the model only.
 */
export function useTimelinePlayback(): {
  registerElement: (trackId: string, element: HTMLMediaElement | null) => void
} {
  const elementsRef = useRef(new Map<string, HTMLMediaElement>())
  const graphRef = useRef<AudioGraph | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  const isPlaying = useTimelineStore((state) => state.isPlaying)
  const playheadTime = useTimelineStore((state) => state.playheadTime)
  const masterVolume = useTimelineStore((state) => state.masterVolume)
  const model = useTimelineStore((state) => state.model)

  const registerElement = useCallback((trackId: string, element: HTMLMediaElement | null) => {
    if (element) elementsRef.current.set(trackId, element)
    else elementsRef.current.delete(trackId)
  }, [])

  const ensureGraph = useCallback((): AudioGraph => {
    if (!graphRef.current) {
      const context = new AudioContext()
      const master = context.createGain()
      master.gain.value = useTimelineStore.getState().masterVolume
      master.connect(context.destination)
      graphRef.current = { context, master, gains: new Map() }
    }
    return graphRef.current
  }, [])

  const gainFor = useCallback(
    (element: HTMLMediaElement): GainNode => {
      const graph = ensureGraph()
      let gain = graph.gains.get(element)
      if (!gain) {
        const source = graph.context.createMediaElementSource(element)
        gain = graph.context.createGain()
        source.connect(gain).connect(graph.master)
        graph.gains.set(element, gain)
      }
      return gain
    },
    [ensureGraph]
  )

  const silence = useCallback(
    (element: HTMLMediaElement) => {
      gainFor(element).gain.value = 0
      if (!element.paused) element.pause()
    },
    [gainFor]
  )

  const driveElement = useCallback(
    (element: HTMLMediaElement, clip: Clip, url: string, time: number, playing: boolean, gain: number) => {
      gainFor(element).gain.value = gain
      element.dataset.clipId = clip.id
      const expected = Math.max(0, timelineTimeToSource(clip, time))
      const sourceKey = `${clip.id}|${url}`
      if (element.dataset.sourceKey !== sourceKey) {
        element.dataset.sourceKey = sourceKey
        element.src = url
        element.playbackRate = clip.speed
        element.currentTime = expected
      } else {
        if (element.playbackRate !== clip.speed) element.playbackRate = clip.speed
        // Don't re-issue a seek while one is pending, or the target keeps moving
        // and the seek never completes (frozen frame + crackling audio).
        if (!element.seeking && Math.abs(element.currentTime - expected) > DRIFT_TOLERANCE_SECONDS) {
          element.currentTime = expected
        }
      }
      if (playing) {
        if (element.paused) void element.play().catch(() => undefined)
      } else if (!element.paused) {
        element.pause()
      }
    },
    [gainFor]
  )

  // Park a clip in a hidden, muted, paused element so swapping to it at a clip
  // boundary shows its first frame instantly — no black gap.
  const preloadElement = useCallback(
    (element: HTMLMediaElement, clip: Clip, url: string) => {
      gainFor(element).gain.value = 0
      element.style.opacity = '0'
      const sourceKey = `${clip.id}|${url}`
      if (element.dataset.sourceKey !== sourceKey) {
        element.dataset.sourceKey = sourceKey
        element.dataset.clipId = clip.id
        element.src = url
        element.playbackRate = clip.speed
        element.currentTime = Math.max(0, clip.sourceIn)
      }
      if (!element.paused) element.pause()
    },
    [gainFor]
  )

  const hideVideoSlot = useCallback(
    (element: HTMLMediaElement) => {
      silence(element)
      element.style.opacity = '0'
    },
    [silence]
  )

  const sync = useCallback(
    (time: number, playing: boolean) => {
      const currentModel = useTimelineStore.getState().model
      const mediaItems = useMediaStore.getState().items
      const denoise = useDenoiseStore.getState()
      const mediaById = (id: string): MediaItem | undefined => mediaItems.find((item) => item.id === id)
      const proxyUrlFor = (clip: Clip, mediaPath: string): string | null => {
        if (!clip.denoise.enabled) return null
        const proxy = denoise.getProxyPath(mediaPath, clip.denoise.strength)
        if (!proxy) denoise.ensureProxy(mediaPath, clip.denoise.strength)
        return proxy ? toMediaUrl(proxy) : null
      }

      for (const track of currentModel.tracks) {
        const clips = getTrackClips(currentModel, track.id)
        const activeIndex = clips.findIndex(
          (clip) => time >= clip.startOnTimeline && time < clipTimelineEnd(clip)
        )
        const active = activeIndex >= 0 ? (clips[activeIndex] ?? null) : null

        if (track.kind === 'audio') {
          const element = elementsRef.current.get(track.id)
          if (!element) continue
          const media = active ? mediaById(active.mediaId) : undefined
          if (!active || !media) {
            silence(element)
            continue
          }
          const url = proxyUrlFor(active, media.path) ?? toMediaUrl(media.path)
          driveElement(element, active, url, time, playing, active.volume)
          continue
        }

        // Video track: two slots — one shows the active clip, the other preloads
        // the next so boundary crossings don't flash black.
        const slotA = elementsRef.current.get(track.id)
        const slotB = elementsRef.current.get(videoSlotBKey(track.id))
        const denoiseElement = elementsRef.current.get(denoiseElementKey(track.id)) ?? null
        if (!slotA || !slotB) continue

        const next =
          activeIndex >= 0
            ? (clips[activeIndex + 1] ?? null)
            : (clips.find((clip) => clip.startOnTimeline > time) ?? null)
        const nextMedia = next ? mediaById(next.mediaId) : undefined
        const media = active ? mediaById(active.mediaId) : undefined

        if (!active || !media) {
          hideVideoSlot(slotA)
          hideVideoSlot(slotB)
          if (denoiseElement) silence(denoiseElement)
          if (next && nextMedia) {
            const slot = slotA.dataset.clipId === next.id ? slotA : slotB
            preloadElement(slot, next, toMediaUrl(nextMedia.path))
          }
          continue
        }

        // Pick the active slot, keeping any already-preloaded `next` intact.
        let activeSlot = slotA
        let preloadSlot = slotB
        if (slotB.dataset.clipId === active.id) {
          activeSlot = slotB
          preloadSlot = slotA
        } else if (slotA.dataset.clipId === active.id) {
          activeSlot = slotA
          preloadSlot = slotB
        } else if (next && slotA.dataset.clipId === next.id) {
          activeSlot = slotB
          preloadSlot = slotA
        }

        const originalUrl = toMediaUrl(media.path)
        const proxyUrl = proxyUrlFor(active, media.path)
        if (proxyUrl && denoiseElement) {
          driveElement(activeSlot, active, originalUrl, time, playing, 0)
          driveElement(denoiseElement, active, proxyUrl, time, playing, active.volume)
        } else {
          driveElement(activeSlot, active, originalUrl, time, playing, active.volume)
          if (denoiseElement) silence(denoiseElement)
        }
        activeSlot.style.opacity = '1'

        if (next && nextMedia) preloadElement(preloadSlot, next, toMediaUrl(nextMedia.path))
        else hideVideoSlot(preloadSlot)
      }
    },
    [silence, driveElement, preloadElement, hideVideoSlot]
  )

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
      sync(useTimelineStore.getState().playheadTime, false)
      return
    }

    const graph = ensureGraph()
    if (graph.context.state === 'suspended') void graph.context.resume()

    const tick = (ts: number): void => {
      const last = lastTsRef.current
      lastTsRef.current = ts
      const dt = last === null ? 0 : (ts - last) / 1000
      const store = useTimelineStore.getState()
      const duration = timelineDuration(store.model)
      // Wall-clock master: the playhead always advances at real time, so it never
      // stalls or jumps backward. Elements are seeked toward it in sync().
      const next = store.playheadTime + dt

      if (duration > 0 && next >= duration) {
        store.setPlayhead(duration)
        store.pause()
        sync(duration, false)
        return
      }

      store.setPlayhead(next)
      sync(next, true)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isPlaying, ensureGraph, sync])

  // Re-sync the paused frame + audio position on scrub or edit.
  useEffect(() => {
    if (!isPlaying) sync(playheadTime, false)
  }, [playheadTime, model, isPlaying, sync])

  useEffect(() => {
    if (graphRef.current) graphRef.current.master.gain.value = masterVolume
  }, [masterVolume])

  // Only stop the clock on unmount. The AudioContext and its MediaElementSource
  // nodes are intentionally NOT torn down: an element can be connected to a
  // source exactly once for its lifetime, so recreating the graph (e.g. under
  // StrictMode's double-invoke) would fail. The graph lives for the app session.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  return { registerElement }
}
