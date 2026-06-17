/** Extracts the version token from `ffmpeg -version` / `ffprobe -version` output,
 * whose first line looks like "ffmpeg version 6.0-static https://...". */
export function parseToolVersion(stdout: string): string {
  const firstLine = stdout.split('\n', 1)[0]?.trim() ?? ''
  const match = firstLine.match(/version\s+(\S+)/i)
  return match?.[1] ?? firstLine
}
