import { create } from 'zustand'
import { mediaService } from '../services/mediaService'

type FilmstripStatus = 'generating' | 'ready' | 'error'

interface FilmstripEntry {
  status: FilmstripStatus
  /** Absolute path to the cached strip sprite (when ready). */
  path?: string
}

interface FilmstripState {
  strips: Record<string, FilmstripEntry>
  /** Requests a filmstrip for a video source if not already requested (idempotent). */
  ensure: (mediaPath: string, durationSeconds: number) => void
  /** Forgets a path's entry (on media removal) so it can regenerate later. */
  clear: (mediaPath: string) => void
  /** The ready strip path, or null while generating / on error. */
  getPath: (mediaPath: string) => string | null
}

export const useFilmstripStore = create<FilmstripState>((set, get) => ({
  strips: {},

  ensure: (mediaPath, durationSeconds) => {
    if (get().strips[mediaPath]) return
    set((state) => ({ strips: { ...state.strips, [mediaPath]: { status: 'generating' } } }))
    void mediaService.generateFilmstrip(mediaPath, durationSeconds).then((result) => {
      // Drop the result if the entry was cleared mid-flight (media removed) so a
      // cancelled job doesn't leave a stuck 'error' that blocks retry.
      if (get().strips[mediaPath]?.status !== 'generating') return
      set((state) => ({
        strips: {
          ...state.strips,
          [mediaPath]: result.ok ? { status: 'ready', path: result.value.filmstripPath } : { status: 'error' }
        }
      }))
    })
  },

  clear: (mediaPath) =>
    set((state) => {
      if (!state.strips[mediaPath]) return state
      const strips = { ...state.strips }
      delete strips[mediaPath]
      return { strips }
    }),

  getPath: (mediaPath) => {
    const entry = get().strips[mediaPath]
    return entry?.status === 'ready' ? (entry.path ?? null) : null
  }
}))
