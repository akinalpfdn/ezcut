import { useCallback, useEffect, useRef } from 'react'
import { type Clip, clipTimelineEnd, getTrackClips, timelineDuration, timelineTimeToSource } from '@shared'
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

  const sync = useCallback(
    (time: number, playing: boolean) => {
      const currentModel = useTimelineStore.getState().model
      const mediaItems = useMediaStore.getState().items
      const denoise = useDenoiseStore.getState()

      for (const track of currentModel.tracks) {
        const element = elementsRef.current.get(track.id)
        if (!element) continue
        const denoiseElement = elementsRef.current.get(denoiseElementKey(track.id)) ?? null

        const active = getTrackClips(currentModel, track.id).find(
          (clip) => time >= clip.startOnTimeline && time < clipTimelineEnd(clip)
        )
        const media = active ? mediaItems.find((item) => item.id === active.mediaId) : undefined

        if (!active || !media) {
          silence(element)
          if (denoiseElement) silence(denoiseElement)
          continue
        }

        // Resolve the denoised proxy if the clip wants denoise, generating it on
        // demand. Until it is ready, fall back to the original audio.
        let proxyUrl: string | null = null
        if (active.denoise.enabled) {
          proxyUrl = denoise.getProxyPath(media.path, active.denoise.strength)
          if (!proxyUrl) denoise.ensureProxy(media.path, active.denoise.strength)
        }

        const originalUrl = toMediaUrl(media.path)

        if (track.kind === 'audio') {
          driveElement(element, active, proxyUrl ? toMediaUrl(proxyUrl) : originalUrl, time, playing, active.volume)
          if (denoiseElement) silence(denoiseElement)
        } else if (proxyUrl && denoiseElement) {
          // Video plays for the picture (muted); its denoised audio plays in parallel.
          driveElement(element, active, originalUrl, time, playing, 0)
          driveElement(denoiseElement, active, toMediaUrl(proxyUrl), time, playing, active.volume)
        } else {
          driveElement(element, active, originalUrl, time, playing, active.volume)
          if (denoiseElement) silence(denoiseElement)
        }
      }
    },
    [silence, driveElement]
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
