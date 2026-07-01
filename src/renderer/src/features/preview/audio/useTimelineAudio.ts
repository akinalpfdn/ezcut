import { useEffect, useRef } from 'react'
import {
  clipTimelineDuration,
  getClipTransition,
  getIncomingTransition,
  isClipAudible,
  type Clip,
  timelineDuration
} from '@shared'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useTransportStore } from '../../../stores/transportStore'
import { useMediaStore } from '../../../stores/mediaStore'
import { useDenoiseStore } from '../../../stores/denoiseStore'
import { toMediaUrl } from '../../../utils/mediaUrl'
import { AUDIO_BUFFER_CACHE_BYTES } from '../../../config/playback'

interface Anchor {
  ctxTime: number
  playhead: number
}

interface ScheduledClip {
  gain: GainNode
  /** Tears down this clip's audio — a buffer source, or a media element + timers. */
  stop: () => void
}

const SEEK_REANCHOR_THRESHOLD = 0.25

/**
 * A sped clip that must keep its original pitch can't use an AudioBufferSourceNode
 * (its playbackRate resamples, shifting pitch). Chromium media elements have native
 * pitch-preserving time-stretch (`preservesPitch`), so those clips stream through an
 * <audio> element instead. At 1x, or when pitch-shift is desired, the buffer path is
 * used (identical output, sample-accurate).
 */
const needsPitchElement = (clip: Clip): boolean =>
  (clip.speed > 0 ? clip.speed : 1) !== 1 && clip.preservePitch

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
  const bufferBytesRef = useRef(0)
  const loadingRef = useRef(new Set<string>())
  const scheduledRef = useRef(new Map<string, ScheduledClip>())
  const anchorRef = useRef<Anchor | null>(null)
  const lastSetRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const isPlaying = useTransportStore((state) => state.isPlaying)
  const masterVolume = useTransportStore((state) => state.masterVolume)
  const model = useTimelineStore((state) => state.model)

  const ensureContext = (): { ctx: AudioContext; master: GainNode } => {
    if (!ctxRef.current || !masterRef.current) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = useTransportStore.getState().masterVolume
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

  // Decoded AudioBuffers hold a clip's whole PCM in RAM, so the cache is a
  // byte-bounded LRU: reads bump to most-recently-used; inserts evict the oldest
  // once over budget (the playing clips are MRU, so they're evicted last).
  const bufferBytes = (buffer: AudioBuffer): number => buffer.length * buffer.numberOfChannels * 4

  const getBuffer = (url: string): AudioBuffer | undefined => {
    const buffer = buffersRef.current.get(url)
    if (!buffer) return undefined
    buffersRef.current.delete(url)
    buffersRef.current.set(url, buffer)
    return buffer
  }

  const putBuffer = (url: string, buffer: AudioBuffer): void => {
    buffersRef.current.set(url, buffer)
    bufferBytesRef.current += bufferBytes(buffer)
    while (bufferBytesRef.current > AUDIO_BUFFER_CACHE_BYTES && buffersRef.current.size > 1) {
      const oldest = buffersRef.current.keys().next().value as string
      const evicted = buffersRef.current.get(oldest)
      if (evicted) bufferBytesRef.current -= bufferBytes(evicted)
      buffersRef.current.delete(oldest)
    }
  }

  // Drops cached buffers no longer referenced by any clip (e.g. a clip/media was
  // deleted), reclaiming RAM immediately instead of waiting for budget pressure.
  // A url can be shared (same media in >1 clip; denoise toggles the url), so a
  // url is live if ANY current clip would use it. Side-effect-free (no ensureProxy).
  const pruneOrphanBuffers = (): void => {
    const items = useMediaStore.getState().items
    const live = new Set<string>()
    for (const clip of Object.values(useTimelineStore.getState().model.clips)) {
      const media = items.find((item) => item.id === clip.mediaId)
      if (!media || !media.hasAudio) continue
      live.add(toMediaUrl(media.path))
      if (clip.denoise.enabled) {
        const proxy = useDenoiseStore.getState().getProxyPath(media.path, clip.denoise.strength)
        if (proxy) live.add(toMediaUrl(proxy))
      }
    }
    for (const url of [...buffersRef.current.keys()]) {
      if (live.has(url)) continue
      const evicted = buffersRef.current.get(url)
      if (evicted) bufferBytesRef.current -= bufferBytes(evicted)
      buffersRef.current.delete(url)
    }
  }

  const loadBuffer = async (url: string): Promise<AudioBuffer | null> => {
    const cached = getBuffer(url)
    if (cached) return cached
    if (loadingRef.current.has(url)) return null
    loadingRef.current.add(url)
    try {
      const { ctx } = ensureContext()
      const response = await fetch(url)
      const data = await response.arrayBuffer()
      const buffer = await ctx.decodeAudioData(data)
      putBuffer(url, buffer)
      return buffer
    } catch (error) {
      console.error('[audio] decode failed', url, error)
      return null
    } finally {
      loadingRef.current.delete(url)
    }
  }

  const stopAll = (): void => {
    for (const { stop } of scheduledRef.current.values()) {
      try {
        stop()
      } catch {
        // already stopped
      }
    }
    scheduledRef.current.clear()
  }

  // Schedules the clip's gain as a piecewise-linear envelope: 0 when inaudible
  // (clip/track mute or non-soloed), otherwise clip.volume with linear fade-in/out
  // at the edges. Re-applied live on any model change (volume drag, mute/solo,
  // fade edit). Times are mapped from timeline seconds to AudioContext time via
  // the anchor; breakpoints in the past collapse to the current value.
  const applyClipGain = (gain: GainNode, clip: Clip, anchor: Anchor): void => {
    const ctx = ctxRef.current
    if (!ctx) return
    const model = useTimelineStore.getState().model
    const base = isClipAudible(model, clip) ? clip.volume : 0
    const clipDur = clipTimelineDuration(clip)
    const startCtx = anchor.ctxTime + (clip.startOnTimeline - anchor.playhead)
    const endCtx = startCtx + clipDur
    // Crossfade a transition's audio: the longer of the user fade and the
    // transition's overlap on each edge.
    const crossIn = getIncomingTransition(model, clip)?.duration ?? 0
    const crossOut = getClipTransition(model, clip)?.duration ?? 0
    const fadeIn = Math.max(0, Math.min(Math.max(clip.fadeIn, crossIn), clipDur))
    const fadeOut = Math.max(0, Math.min(Math.max(clip.fadeOut, crossOut), clipDur))
    const fadeInEndCtx = startCtx + fadeIn
    const fadeOutStartCtx = endCtx - fadeOut

    const gainAt = (t: number): number => {
      if (base === 0) return 0
      let g = base
      if (fadeIn > 0 && t < fadeInEndCtx) g = base * Math.max(0, (t - startCtx) / fadeIn)
      if (fadeOut > 0 && t > fadeOutStartCtx) g = Math.min(g, base * Math.max(0, (endCtx - t) / fadeOut))
      return Math.max(0, Math.min(base, g))
    }

    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gainAt(now), now)
    for (const t of [fadeInEndCtx, fadeOutStartCtx, endCtx].filter((point) => point > now).sort((a, b) => a - b)) {
      gain.gain.linearRampToValueAtTime(gainAt(t), t)
    }
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
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = speed
    source.connect(gain).connect(master)
    applyClipGain(gain, clip, anchor)
    source.start(Math.max(when, now), Math.max(0, offset), remaining)
    const entry: ScheduledClip = {
      gain,
      stop: () => {
        source.onended = null
        try {
          source.stop()
        } catch {
          // already stopped
        }
        source.disconnect()
        gain.disconnect()
      }
    }
    source.onended = () => {
      if (scheduledRef.current.get(clip.id) === entry) scheduledRef.current.delete(clip.id)
    }
    scheduledRef.current.set(clip.id, entry)
  }

  // Pitch-preserving playback for a sped clip: stream it through a media element
  // (native `preservesPitch`) instead of a buffer source. The <audio> loads via the
  // ezmedia protocol (CORS-enabled + Range, so it stays untainted and seekable) and
  // routes through the same per-clip gain envelope. Timeline scheduling is done with
  // timers rather than sample-accurate start(), which is fine for preview.
  const playClipElement = (clip: Clip, url: string, anchor: Anchor): void => {
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
    if (offset >= clip.sourceOut) return
    // Timeline seconds this clip still plays from `when` (source span / speed).
    const remaining = (clip.sourceOut - offset) / speed
    if (remaining <= 0) return

    const el = new Audio()
    el.crossOrigin = 'anonymous' // untainted via the protocol's ACAO:* → real samples in the graph
    el.preservesPitch = true // keep pitch while time-stretching (Chromium native)
    el.src = url
    const node = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    node.connect(gain).connect(master)
    applyClipGain(gain, clip, anchor)

    let startTimer: ReturnType<typeof setTimeout> | null = null
    let stopTimer: ReturnType<typeof setTimeout> | null = null
    const teardown = (): void => {
      if (startTimer) clearTimeout(startTimer)
      if (stopTimer) clearTimeout(stopTimer)
      startTimer = null
      stopTimer = null
      try {
        el.pause()
      } catch {
        // ignore
      }
      el.src = ''
      try {
        node.disconnect()
        gain.disconnect()
      } catch {
        // already disconnected
      }
    }

    const entry: ScheduledClip = { gain, stop: teardown }

    const beginPlayback = (): void => {
      if (anchorRef.current !== anchor) return
      el.playbackRate = speed
      const seekAndPlay = (): void => {
        try {
          el.currentTime = offset
        } catch {
          // seek attempted before metadata — falls back to playing from 0
        }
        void el.play().catch(() => {
          // loading/autoplay race — ignore
        })
        stopTimer = setTimeout(() => {
          teardown()
          if (scheduledRef.current.get(clip.id) === entry) scheduledRef.current.delete(clip.id)
        }, remaining * 1000 + 60)
      }
      if (el.readyState >= 1) seekAndPlay()
      else el.addEventListener('loadedmetadata', seekAndPlay, { once: true })
    }

    scheduledRef.current.set(clip.id, entry)
    const delay = Math.max(0, when - now)
    if (delay <= 0) beginPlayback()
    else startTimer = setTimeout(beginPlayback, delay * 1000)
  }

  const scheduleAll = (anchor: Anchor): void => {
    const items = useMediaStore.getState().items
    for (const clip of Object.values(useTimelineStore.getState().model.clips)) {
      if (scheduledRef.current.has(clip.id)) continue
      const media = items.find((item) => item.id === clip.mediaId)
      if (!media || !media.hasAudio) continue
      const url = urlForClip(clip, media.path)
      if (needsPitchElement(clip)) {
        playClipElement(clip, url, anchor)
        continue
      }
      const buffer = getBuffer(url)
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
    reanchor(useTransportStore.getState().playheadTime)

    const tick = (): void => {
      const anchor = anchorRef.current
      if (!anchor) return
      const transport = useTransportStore.getState()

      // Honor an external seek (scrub while playing).
      if (Math.abs(transport.playheadTime - lastSetRef.current) > SEEK_REANCHOR_THRESHOLD) {
        reanchor(transport.playheadTime)
      }

      const current = anchorRef.current
      if (!current) return
      const duration = timelineDuration(useTimelineStore.getState().model)
      const playhead = current.playhead + (ctx.currentTime - current.ctxTime)
      if (duration <= 0) {
        // Timeline emptied mid-play (e.g. its media was deleted) — stop.
        transport.pause()
        return
      }
      if (playhead >= duration) {
        lastSetRef.current = duration
        transport.setPlayhead(duration)
        transport.pause()
        return
      }
      lastSetRef.current = playhead
      transport.setPlayhead(playhead)
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

  // Live per-clip volume; stop audio for clips that were removed mid-play (e.g.
  // their source media was deleted from the bin).
  useEffect(() => {
    const anchor = anchorRef.current
    for (const [clipId, entry] of scheduledRef.current) {
      const clip = model.clips[clipId]
      if (clip) {
        if (anchor) applyClipGain(entry.gain, clip, anchor)
      } else {
        try {
          entry.stop()
        } catch {
          // already stopped
        }
        scheduledRef.current.delete(clipId)
      }
    }
    pruneOrphanBuffers()
  }, [model])

  // Tear down on unmount: stop sources, close the AudioContext, and release all
  // decoded buffers — otherwise the context (browsers cap concurrent contexts)
  // and the whole PCM cache leak for the rest of the session.
  useEffect(() => {
    return () => {
      stopAll()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      void ctxRef.current?.close()
      ctxRef.current = null
      masterRef.current = null
      buffersRef.current.clear()
      bufferBytesRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
