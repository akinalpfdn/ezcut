/** Importable media types and native open-dialog filters. */

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] as const
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] as const

export const MEDIA_OPEN_FILTERS = [
  { name: 'Media', extensions: [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS] },
  { name: 'Video', extensions: [...VIDEO_EXTENSIONS] },
  { name: 'Audio', extensions: [...AUDIO_EXTENSIONS] },
  { name: 'All Files', extensions: ['*'] }
]
