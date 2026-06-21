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
      set((state) => ({
        proxies: {
          ...state.proxies,
          [key]: result.ok ? { status: 'ready', proxyPath: result.value.proxyPath } : { status: 'error' }
        }
      }))
    })
  },

  getProxyPath: (mediaPath, strength) => {
    const entry = get().proxies[proxyKey(mediaPath, strength)]
    return entry?.status === 'ready' ? (entry.proxyPath ?? null) : null
  }
}))
