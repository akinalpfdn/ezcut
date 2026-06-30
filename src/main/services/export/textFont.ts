import type { FontFamily } from '@shared'

/** Default sans family name for drawtext's fontconfig-based `font=` option (the
 * ffmpeg build is compiled with --enable-fontconfig). Avoids a font file PATH,
 * which freetype loads strictly and which is fragile to escape on Windows. */
export function resolveTextFontName(): string {
  return process.platform === 'win32' || process.platform === 'darwin' ? 'Arial' : 'sans-serif'
}

/** Font family for an overlay's choice (used by the ASS `\fn` tag, resolved via
 * libass/DirectWrite). Generic presets map to platform defaults; any other value
 * is a system font family name used as-is. */
export function resolveFamilyFontName(family: FontFamily): string {
  if (family === 'sans') return resolveTextFontName()
  if (family === 'serif') return 'serif'
  if (family === 'mono') return 'monospace'
  return family
}
