/** User-rebindable editor actions. */
export const KEYMAP_ACTIONS = [
  'playPause',
  'split',
  'delete',
  'closeGaps',
  'pinPlayhead',
  'frameBack',
  'frameForward',
  'undo',
  'redo',
  'copy',
  'cut',
  'paste',
  'duplicate',
  'rippleDelete',
  'marker'
] as const

export type KeymapAction = (typeof KEYMAP_ACTIONS)[number]

/** Maps each action to a normalized key-combo string (e.g. "Ctrl+KeyZ", "Space"). */
export type Keymap = Record<KeymapAction, string>

/** Persisted app settings (userData/settings.json). */
export interface AppSettings {
  keymap: Keymap
  language?: string
}
