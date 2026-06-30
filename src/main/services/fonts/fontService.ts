import { getFonts } from 'font-list'

let cache: string[] | null = null

/**
 * Installed system font family names — sorted, de-duplicated, unquoted — cached for
 * the session. Both the canvas preview and the ASS exporter can render a font by
 * its family name (libass resolves via DirectWrite/fontconfig), so enumerating the
 * system fonts is enough for full preview↔export parity. Falls back to an empty
 * list if enumeration fails (the picker still offers the generic families).
 */
export async function listFonts(): Promise<string[]> {
  if (cache) return cache
  try {
    const raw = await getFonts({ disableQuoting: true })
    const names = raw.map((name) => name.replace(/^"+|"+$/g, '').trim()).filter((name) => name.length > 0)
    cache = [...new Set(names)].sort((a, b) => a.localeCompare(b))
  } catch {
    cache = []
  }
  return cache
}
