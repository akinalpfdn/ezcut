import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { MediaItem } from '@shared'
import { toMediaUrl } from '../../utils/mediaUrl'
import { DEFAULT_SPEED, DEFAULT_VOLUME, FALLBACK_FPS } from '../../config/playback'

interface PreviewEngineState {
  isPlaying: boolean
  currentTime: number
  duration: number
  speed: number
  volume: number
}

export interface PreviewEngine extends PreviewEngineState {
  togglePlay: () => void
  seek: (time: number) => void
  stepFrames: (frames: number) => void
  setSpeed: (speed: number) => void
  setVolume: (volume: number) => void
}

interface AudioGraph {
  context: AudioContext
  gain: GainNode
}

/**
 * Drives a single <video> element (used for both video and audio clips) and
 * routes its audio through a Web Audio GainNode so volume is live and will
 * generalize to the multi-track mixer in Phase 4. Reads the selected item;
 * never mutates it.
 */
export function usePreviewEngine(
  mediaRef: RefObject<HTMLMediaElement | null>,
  item: MediaItem | null
): PreviewEngine {
  const [state, setState] = useState<PreviewEngineState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    speed: DEFAULT_SPEED,
    volume: DEFAULT_VOLUME
  })
  const audioGraphRef = useRef<AudioGraph | null>(null)

  // Load the selected source. Speed/volume are applied separately so changing
  // them does not reload the media.
  useEffect(() => {
    const element = mediaRef.current
    if (!element) return
    if (item) {
      element.src = toMediaUrl(item.path)
      element.load()
    } else {
      element.removeAttribute('src')
      element.load()
    }
    setState((previous) => ({ ...previous, isPlaying: false, currentTime: 0, duration: 0 }))
  }, [item, mediaRef])

  // Bind media element events to state.
  useEffect(() => {
    const element = mediaRef.current
    if (!element) return

    const onLoaded = (): void =>
      setState((previous) => ({ ...previous, duration: Number.isFinite(element.duration) ? element.duration : 0 }))
    const onTimeUpdate = (): void =>
      setState((previous) => ({ ...previous, currentTime: element.currentTime }))
    const onPlay = (): void => setState((previous) => ({ ...previous, isPlaying: true }))
    const onPause = (): void => setState((previous) => ({ ...previous, isPlaying: false }))
    const onError = (): void =>
      console.error('[preview] media error', element.error?.code, element.error?.message, element.currentSrc)

    element.addEventListener('loadedmetadata', onLoaded)
    element.addEventListener('timeupdate', onTimeUpdate)
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('ended', onPause)
    element.addEventListener('error', onError)

    return () => {
      element.removeEventListener('loadedmetadata', onLoaded)
      element.removeEventListener('timeupdate', onTimeUpdate)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('ended', onPause)
      element.removeEventListener('error', onError)
    }
  }, [mediaRef])

  // Close the audio context on unmount.
  useEffect(() => {
    return () => {
      void audioGraphRef.current?.context.close()
      audioGraphRef.current = null
    }
  }, [])

  const ensureAudioGraph = useCallback((): AudioGraph | null => {
    const element = mediaRef.current
    if (!element) return null
    if (audioGraphRef.current) return audioGraphRef.current

    const context = new AudioContext()
    const source = context.createMediaElementSource(element)
    const gain = context.createGain()
    gain.gain.value = state.volume
    source.connect(gain).connect(context.destination)
    audioGraphRef.current = { context, gain }
    return audioGraphRef.current
  }, [mediaRef, state.volume])

  const togglePlay = useCallback(() => {
    const element = mediaRef.current
    if (!element || !item) return
    const graph = ensureAudioGraph()
    if (graph?.context.state === 'suspended') void graph.context.resume()
    if (element.paused) void element.play()
    else element.pause()
  }, [mediaRef, item, ensureAudioGraph])

  const seek = useCallback(
    (time: number) => {
      const element = mediaRef.current
      if (!element) return
      const clamped = Math.min(Math.max(time, 0), state.duration || element.duration || 0)
      element.currentTime = clamped
      setState((previous) => ({ ...previous, currentTime: clamped }))
    },
    [mediaRef, state.duration]
  )

  const stepFrames = useCallback(
    (frames: number) => {
      const element = mediaRef.current
      if (!element) return
      element.pause()
      const fps = item?.fps && item.fps > 0 ? item.fps : FALLBACK_FPS
      seek(element.currentTime + frames / fps)
    },
    [mediaRef, item, seek]
  )

  const setSpeed = useCallback(
    (speed: number) => {
      const element = mediaRef.current
      if (element) element.playbackRate = speed
      setState((previous) => ({ ...previous, speed }))
    },
    [mediaRef]
  )

  const setVolume = useCallback(
    (volume: number) => {
      const element = mediaRef.current
      const graph = audioGraphRef.current
      if (graph) graph.gain.gain.value = volume
      else if (element) element.volume = volume
      setState((previous) => ({ ...previous, volume }))
    },
    [mediaRef]
  )

  return { ...state, togglePlay, seek, stepFrames, setSpeed, setVolume }
}
