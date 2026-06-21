import { useEffect, useRef } from 'react'
import { type Clip, timelineDuration } from '@shared'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useMediaStore } from '../../../stores/mediaStore'
import { useDenoiseStore } from '../../../stores/denoiseStore'
import { toMediaUrl } from '../../../utils/mediaUrl'

interface Anchor {
  ctxTime: number
  playhead: number
}

interface ScheduledClip {
  source: AudioBufferSourceNode
  gain: GainNode
}

const SEEK_REANCHOR_THRESHOLD = 0.25

/**
 * Sample-accurate multi-track audio. The AudioContext is the master clock: it
 * drives the store playhead (the canvas video follows it), and each clip's audio
 * is scheduled at its exact timeline time via an AudioBufferSourceNode, so
 * playback is gapless and click-free. Per-clip gain is live; denoise plays the
 * proxy buffer.
 */
export function useTimelineAudio(): void {
  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const buffersRef = useRef(new Map<string, AudioBuffer>())
  const loadingRef = useRef(new Set<string>())
  const scheduledRef = useRef(new Map<string, ScheduledClip>())
  const anchorRef = useRef<Anchor | null>(null)
  const lastSetRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const isPlaying = useTimelineStore((state) => state.isPlaying)
  const masterVolume = useTimelineStore((state) => state.masterVolume)
  const model = useTimelineStore((state) => state.model)

  const ensureContext = (): { ctx: AudioContext; master: GainNode } => {
    if (!ctxRef.current || !masterRef.current) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = useTimelineStore.getState().masterVolume
      master.connect(ctx.destination)
      ctxRef.current = ctx
      masterRef.current = master
    }
    return { ctx: ctxRef.current, master: masterRef.current }
  }

  const urlForClip = (clip: Clip, mediaPath: string): string => {
    if (clip.denoise.enabled) {
      const proxy = useDenoiseStore.getState().getProxyPath(mediaPath, clip.denoise.strength)
      if (proxy) return toMediaUrl(proxy)
      useDenoiseStore.getState().ensureProxy(mediaPath, clip.denoise.strength)
    }
    return toMediaUrl(mediaPath)
  }

  const loadBuffer = async (url: string): Promise<AudioBuffer | null> => {
    const cached = buffersRef.current.get(url)
    if (cached) return cached
    if (loadingRef.current.has(url)) return null
    loadingRef.current.add(url)
    try {
      const { ctx } = ensureContext()
      const response = await fetch(url)
      const data = await response.arrayBuffer()
      const buffer = await ctx.decodeAudioData(data)
      buffersRef.current.set(url, buffer)
      return buffer
    } catch (error) {
      console.error('[audio] decode failed', url, error)
      return null
    } finally {
      loadingRef.current.delete(url)
    }
  }

  const stopAll = (): void => {
    for (const { source } of scheduledRef.current.values()) {
      try {
        source.onended = null
        source.stop()
        source.disconnect()
      } catch {
        // already stopped
      }
    }
    scheduledRef.current.clear()
  }

  const playClip = (clip: Clip, buffer: AudioBuffer, anchor: Anchor): void => {
    const { ctx, master } = ensureContext()
    if (scheduledRef.current.has(clip.id) || anchorRef.current !== anchor) return

    const speed = clip.speed > 0 ? clip.speed : 1
    const clipStartCtx = anchor.ctxTime + (clip.startOnTimeline - anchor.playhead)
    const now = ctx.currentTime
    let when = clipStartCtx
    let offset = clip.sourceIn
    if (clipStartCtx < now) {
      offset = clip.sourceIn + (now - clipStartCtx) * speed
      when = now
    }
    if (offset >= buffer.duration) return
    const remaining = Math.min(clip.sourceOut, buffer.duration) - offset
    if (remaining <= 0) return

    const gain = ctx.createGain()
    gain.gain.value = clip.volume
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = speed
    source.connect(gain).connect(master)
    source.start(Math.max(when, now), Math.max(0, offset), remaining)
    const entry: ScheduledClip = { source, gain }
    source.onended = () => {
      if (scheduledRef.current.get(clip.id) === entry) scheduledRef.current.delete(clip.id)
    }
    scheduledRef.current.set(clip.id, entry)
  }

  const scheduleAll = (anchor: Anchor): void => {
    const items = useMediaStore.getState().items
    for (const clip of Object.values(useTimelineStore.getState().model.clips)) {
      if (scheduledRef.current.has(clip.id)) continue
      const media = items.find((item) => item.id === clip.mediaId)
      if (!media || !media.hasAudio) continue
      const url = urlForClip(clip, media.path)
      const buffer = buffersRef.current.get(url)
      if (buffer) {
        playClip(clip, buffer, anchor)
      } else {
        void loadBuffer(url).then((loaded) => {
          if (loaded && anchorRef.current === anchor) playClip(clip, loaded, anchor)
        })
      }
    }
  }

  const reanchor = (playhead: number): void => {
    const { ctx } = ensureContext()
    stopAll()
    anchorRef.current = { ctxTime: ctx.currentTime, playhead }
    lastSetRef.current = playhead
    scheduleAll(anchorRef.current)
  }

  // Master clock + scheduling while playing.
  useEffect(() => {
    if (!isPlaying) return
    const { ctx } = ensureContext()
    void ctx.resume()
    reanchor(useTimelineStore.getState().playheadTime)

    const tick = (): void => {
      const anchor = anchorRef.current
      if (!anchor) return
      const store = useTimelineStore.getState()

      // Honor an external seek (scrub while playing).
      if (Math.abs(store.playheadTime - lastSetRef.current) > SEEK_REANCHOR_THRESHOLD) {
        reanchor(store.playheadTime)
      }

      const current = anchorRef.current
      if (!current) return
      const duration = timelineDuration(store.model)
      const playhead = current.playhead + (ctx.currentTime - current.ctxTime)
      if (duration > 0 && playhead >= duration) {
        lastSetRef.current = duration
        store.setPlayhead(duration)
        store.pause()
        return
      }
      lastSetRef.current = playhead
      store.setPlayhead(playhead)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      anchorRef.current = null
      stopAll()
    }
  }, [isPlaying])

  // Live master volume.
  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = masterVolume
  }, [masterVolume])

  // Live per-clip volume (other structural edits apply on next play).
  useEffect(() => {
    for (const [clipId, { gain }] of scheduledRef.current) {
      const clip = model.clips[clipId]
      if (clip) gain.gain.value = clip.volume
    }
  }, [model])
}
