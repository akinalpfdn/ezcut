import { create } from 'zustand'
import { mediaService } from '../services/mediaService'

type ProxyStatus = 'generating' | 'ready' | 'error'

interface ProxyEntry {
  status: ProxyStatus
  /** Transcode progress 0..1 (meaningful while generating). */
  progress: number
  proxyPath?: string
}

interface ProxyState {
  proxies: Record<string, ProxyEntry>
  /** Requests a preview proxy if not already requested (idempotent). */
  ensureProxy: (mediaPath: string, durationSeconds: number) => void
  /** Updates transcode progress (from the main-process progress events). */
  setProgress: (mediaPath: string, ratio: number) => void
  /** Forgets a path's entry (on media removal/cancel) so it can regenerate later. */
  clear: (mediaPath: string) => void
  /** The ready proxy path, or null while generating / on error. */
  getProxyPath: (mediaPath: string) => string | null
}

export const useProxyStore = create<ProxyState>((set, get) => ({
  proxies: {},

  ensureProxy: (mediaPath, durationSeconds) => {
    if (get().proxies[mediaPath]) return
    set((state) => ({ proxies: { ...state.proxies, [mediaPath]: { status: 'generating', progress: 0 } } }))
    void mediaService.generateProxy(mediaPath, durationSeconds).then((result) => {
      // If the entry was cleared mid-flight (media removed/cancelled), drop the
      // result so a cancelled job doesn't leave a stuck 'error' that blocks retry.
      if (get().proxies[mediaPath]?.status !== 'generating') return
      set((state) => ({
        proxies: {
          ...state.proxies,
          [mediaPath]: result.ok
            ? { status: 'ready', progress: 1, proxyPath: result.value.proxyPath }
            : { status: 'error', progress: 0 }
        }
      }))
    })
  },

  clear: (mediaPath) =>
    set((state) => {
      if (!state.proxies[mediaPath]) return state
      const proxies = { ...state.proxies }
      delete proxies[mediaPath]
      return { proxies }
    }),

  setProgress: (mediaPath, ratio) =>
    set((state) => {
      const entry = state.proxies[mediaPath]
      if (!entry || entry.status !== 'generating') return state
      return { proxies: { ...state.proxies, [mediaPath]: { ...entry, progress: ratio } } }
    }),

  getProxyPath: (mediaPath) => {
    const entry = get().proxies[mediaPath]
    return entry?.status === 'ready' ? (entry.proxyPath ?? null) : null
  }
}))
