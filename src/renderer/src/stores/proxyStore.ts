import { create } from 'zustand'
import { mediaService } from '../services/mediaService'

type ProxyStatus = 'generating' | 'ready' | 'error'

interface ProxyEntry {
  status: ProxyStatus
  proxyPath?: string
}

interface ProxyState {
  proxies: Record<string, ProxyEntry>
  /** Requests a preview proxy if not already requested (idempotent). */
  ensureProxy: (mediaPath: string) => void
  /** The ready proxy path, or null while generating / on error. */
  getProxyPath: (mediaPath: string) => string | null
}

export const useProxyStore = create<ProxyState>((set, get) => ({
  proxies: {},

  ensureProxy: (mediaPath) => {
    if (get().proxies[mediaPath]) return
    set((state) => ({ proxies: { ...state.proxies, [mediaPath]: { status: 'generating' } } }))
    void mediaService.generateProxy(mediaPath).then((result) => {
      set((state) => ({
        proxies: {
          ...state.proxies,
          [mediaPath]: result.ok ? { status: 'ready', proxyPath: result.value.proxyPath } : { status: 'error' }
        }
      }))
    })
  },

  getProxyPath: (mediaPath) => {
    const entry = get().proxies[mediaPath]
    return entry?.status === 'ready' ? (entry.proxyPath ?? null) : null
  }
}))
