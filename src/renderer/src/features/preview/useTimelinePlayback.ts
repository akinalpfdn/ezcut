import { useCallback, useEffect, useRef } from 'react'
import { clipTimelineEnd, getTrackClips, timelineDuration, timelineTimeToSource } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { toMediaUrl } from '../../utils/mediaUrl'
import { DRIFT_TOLERANCE_SECONDS } from '../../config/playback'

interface AudioGraph {
  context: AudioContext
  master: GainNode
  gains: Map<HTMLMediaElement, GainNode>
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

  const sync = useCallback(
    (time: number, playing: boolean) => {
      const currentModel = useTimelineStore.getState().model
      const mediaItems = useMediaStore.getState().items

      for (const track of currentModel.tracks) {
        const element = elementsRef.current.get(track.id)
        if (!element) continue
        const gain = gainFor(element)

        const active = getTrackClips(currentModel, track.id).find(
          (clip) => time >= clip.startOnTimeline && time < clipTimelineEnd(clip)
        )
        const media = active ? mediaItems.find((item) => item.id === active.mediaId) : undefined

        if (!active || !media) {
          gain.gain.value = 0
          if (!element.paused) element.pause()
          continue
        }

        const expected = Math.max(0, timelineTimeToSource(active, time))
        if (element.dataset.clipId !== active.id) {
          element.dataset.clipId = active.id
          if (element.dataset.mediaPath !== media.path) {
            element.dataset.mediaPath = media.path
            element.src = toMediaUrl(media.path)
          }
          element.playbackRate = active.speed
          element.currentTime = expected
        } else {
          if (element.playbackRate !== active.speed) element.playbackRate = active.speed
          // Don't re-issue a seek while one is pending, or the target keeps moving
          // and the seek never completes (frozen frame + crackling audio).
          if (!element.seeking && Math.abs(element.currentTime - expected) > DRIFT_TOLERANCE_SECONDS) {
            element.currentTime = expected
          }
        }

        gain.gain.value = active.volume
        if (playing) {
          if (element.paused) void element.play().catch(() => undefined)
        } else if (!element.paused) {
          element.pause()
        }
      }
    },
    [gainFor]
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
