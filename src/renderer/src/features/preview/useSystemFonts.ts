import { useEffect, useState } from 'react'

// Session-wide cache so the font list is fetched from the main process only once,
// no matter how many times the text inspector mounts.
let cache: string[] | null = null
let inflight: Promise<string[]> | null = null

function load(): Promise<string[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = window.electronAPI.listFonts().then((result) => {
      cache = result.ok ? result.value : []
      return cache
    })
  }
  return inflight
}

/** Installed system font family names (sorted), fetched once and cached. */
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(cache ?? [])
  useEffect(() => {
    let active = true
    void load().then((list) => {
      if (active) setFonts(list)
    })
    return () => {
      active = false
    }
  }, [])
  return fonts
}
