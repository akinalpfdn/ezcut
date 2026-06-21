import { create } from 'zustand'
import type { MediaItem } from '@shared'

interface MediaState {
  items: MediaItem[]
  selectedId: string | null
  addItems: (items: MediaItem[]) => void
  setItems: (items: MediaItem[]) => void
  removeItem: (id: string) => void
  select: (id: string | null) => void
}

export const useMediaStore = create<MediaState>((set) => ({
  items: [],
  selectedId: null,
  addItems: (newItems) => set((state) => ({ items: [...state.items, ...newItems] })),
  setItems: (items) => set({ items, selectedId: null }),
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
