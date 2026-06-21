import { create } from 'zustand'
import type { MediaItem, WaveformData } from '@shared'

interface MediaState {
  items: MediaItem[]
  selectedId: string | null
  addItems: (items: MediaItem[]) => void
  setItems: (items: MediaItem[]) => void
  setWaveform: (id: string, waveform: WaveformData) => void
  removeItem: (id: string) => void
  select: (id: string | null) => void
}

export const useMediaStore = create<MediaState>((set) => ({
  items: [],
  selectedId: null,
  addItems: (newItems) => set((state) => ({ items: [...state.items, ...newItems] })),
  setItems: (items) => set({ items, selectedId: null }),
  setWaveform: (id, waveform) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, waveform } : item))
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId
    })),
  select: (id) => set({ selectedId: id })
}))

/** Derives the currently selected item from store state. */
export function selectSelectedItem(state: MediaState): MediaItem | null {
  return state.items.find((item) => item.id === state.selectedId) ?? null
}
