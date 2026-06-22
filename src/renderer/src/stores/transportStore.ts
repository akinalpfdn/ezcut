import { create } from 'zustand'
import { DEFAULT_MASTER_VOLUME } from '../config/playback'

/**
 * Playback transport state, split out of the timeline store: the playhead
 * advances ~60×/sec during playback, so keeping it separate from the undoable
 * edit model keeps the two concerns (and their subscribers) decoupled.
 */
interface TransportState {
  isPlaying: boolean
  playheadTime: number
  masterVolume: number

  play: () => void
  pause: () => void
  togglePlay: () => void
  setPlayhead: (time: number) => void
  setMasterVolume: (volume: number) => void
  /** Reset on project load (paused, playhead at 0). */
  reset: () => void
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  playheadTime: 0,
  masterVolume: DEFAULT_MASTER_VOLUME,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlayhead: (time) => set({ playheadTime: Math.max(0, time) }),
  setMasterVolume: (volume) => set({ masterVolume: Math.min(Math.max(volume, 0), 1) }),
  reset: () => set({ isPlaying: false, playheadTime: 0 })
}))
