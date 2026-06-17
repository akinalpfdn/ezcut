/** Machine error codes + their i18n message keys. Keys must exist in the
 * renderer locale files (tr/en) under the `errors.*` namespace. */

export const ErrorCodes = {
  unsupportedPlatform: 'UNSUPPORTED_PLATFORM',
  ffmpegSpawnFailed: 'FFMPEG_SPAWN_FAILED',
  ffmpegExited: 'FFMPEG_EXITED',
  probeFailed: 'PROBE_FAILED',
  probeParseFailed: 'PROBE_PARSE_FAILED',
  unknown: 'UNKNOWN'
} as const

export const ErrorKeys = {
  unsupportedPlatform: 'errors.unsupportedPlatform',
  ffmpegSpawnFailed: 'errors.ffmpegSpawnFailed',
  ffmpegExited: 'errors.ffmpegExited',
  probeFailed: 'errors.probeFailed',
  probeParseFailed: 'errors.probeParseFailed',
  unknown: 'errors.unknown'
} as const
