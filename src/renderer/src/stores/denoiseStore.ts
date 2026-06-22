import { create } from 'zustand'
import { mediaService } from '../services/mediaService'

type ProxyStatus = 'generating' | 'ready' | 'error'

interface ProxyEntry {
  status: ProxyStatus
  proxyPath?: string
}

interface DenoiseState {
  proxies: Record<string, ProxyEntry>
  /** Requests a denoised proxy if not already requested (idempotent). */
  ensureProxy: (mediaPath: string, strength: number) => void
  /** Forgets all of a path's entries (on media removal/cancel) so they can retry. */
  clearForMedia: (mediaPath: string) => void
  /** The ready proxy path, or null while generating / on error. */
  getProxyPath: (mediaPath: string, strength: number) => string | null
}

function proxyKey(mediaPath: string, strength: number): string {
  return `${mediaPath}|${strength.toFixed(2)}`
}

export const useDenoiseStore = create<DenoiseState>((set, get) => ({
  proxies: {},

  ensureProxy: (mediaPath, strength) => {
    const key = proxyKey(mediaPath, strength)
    if (get().proxies[key]) return
    set((state) => ({ proxies: { ...state.proxies, [key]: { status: 'generating' } } }))
    void mediaService.generateDenoiseProxy(mediaPath, strength).then((result) => {
      // Drop the result if the entry was cleared mid-flight (media removed/
      // cancelled) so a cancelled job doesn't leave a stuck 'error'.
      if (get().proxies[key]?.status !== 'generating') return
      set((state) => ({
        proxies: {
          ...state.proxies,
          [key]: result.ok ? { status: 'ready', proxyPath: result.value.proxyPath } : { status: 'error' }
        }
      }))
    })
  },

  clearForMedia: (mediaPath) =>
    set((state) => {
      const prefix = `${mediaPath}|`
      const proxies = { ...state.proxies }
      let changed = false
      for (const key of Object.keys(proxies)) {
        if (key.startsWith(prefix)) {
          delete proxies[key]
          changed = true
        }
      }
      return changed ? { proxies } : state
    }),

  getProxyPath: (mediaPath, strength) => {
    const entry = get().proxies[proxyKey(mediaPath, strength)]
    return entry?.status === 'ready' ? (entry.proxyPath ?? null) : null
  }
}))
