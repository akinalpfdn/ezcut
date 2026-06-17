/** ffmpeg/ffprobe argument profiles. No inline argument arrays elsewhere. */

export const FFMPEG_ARGS = {
  version: ['-version']
} as const

export const FFPROBE_ARGS = {
  version: ['-version'],
  probe: (filePath: string): string[] => [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ]
} as const

/** execFile output cap — probe JSON for long files stays well under this. */
export const PROCESS_MAX_BUFFER_BYTES = 16 * 1024 * 1024
