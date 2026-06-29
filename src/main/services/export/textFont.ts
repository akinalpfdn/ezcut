import type { FontFamily } from '@shared'

/** Default sans family name for drawtext's fontconfig-based `font=` option (the
 * ffmpeg build is compiled with --enable-fontconfig). Avoids a font file PATH,
 * which freetype loads strictly and which is fragile to escape on Windows. */
export function resolveTextFontName(): string {
  return process.platform === 'win32' || process.platform === 'darwin' ? 'Arial' : 'sans-serif'
}

/** drawtext `font=` family for an overlay's choice. Sans keeps the known-good
 * default; serif/mono use fontconfig generics (always available). */
export function resolveFamilyFontName(family: FontFamily): string {
  if (family === 'serif') return 'serif'
  if (family === 'mono') return 'monospace'
  return resolveTextFontName()
}

/** Wraps a path for use inside a drawtext option value: forward slashes + single
 * quotes, so the Windows drive colon stays literal. */
export function escapeDrawtextPath(path: string): string {
  return `'${path.replace(/\\/g, '/')}'`
}

/** Inline drawtext `text=` value, single-quoted for the filtergraph. Escapes the
 * backslash and percent (drawtext expansions); swaps the apostrophe for a
 * typographic one to avoid filtergraph quote-termination; newlines → spaces. */
export function escapeDrawtextText(text: string): string {
  const inner = text
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/'/g, '’')
    .replace(/[\r\n]+/g, ' ')
  return `'${inner}'`
}
