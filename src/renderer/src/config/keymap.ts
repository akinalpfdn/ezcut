import type { Keymap, KeymapAction } from '@shared'

/** Default key bindings (normalized combo strings; physical key codes). */
export const DEFAULT_KEYMAP: Keymap = {
  playPause: 'Space',
  split: 'KeyS',
  delete: 'Delete',
  closeGaps: 'Ctrl+KeyT',
  pinPlayhead: 'Ctrl+KeyP',
  frameBack: 'ArrowLeft',
  frameForward: 'ArrowRight',
  undo: 'Ctrl+KeyZ',
  redo: 'Ctrl+Shift+KeyZ',
  copy: 'Ctrl+KeyC',
  cut: 'Ctrl+KeyX',
  paste: 'Ctrl+KeyV',
  duplicate: 'Ctrl+KeyD',
  rippleDelete: 'Shift+Delete',
  marker: 'KeyM'
}

/** i18n label key per action. */
export const KEYMAP_ACTION_LABEL_KEYS: Record<KeymapAction, string> = {
  playPause: 'shortcuts.playPause',
  split: 'shortcuts.split',
  delete: 'shortcuts.delete',
  closeGaps: 'shortcuts.closeGaps',
  pinPlayhead: 'shortcuts.pinPlayhead',
  frameBack: 'shortcuts.frameBack',
  frameForward: 'shortcuts.frameForward',
  undo: 'shortcuts.undo',
  redo: 'shortcuts.redo',
  copy: 'shortcuts.copy',
  cut: 'shortcuts.cut',
  paste: 'shortcuts.paste',
  duplicate: 'shortcuts.duplicate',
  rippleDelete: 'shortcuts.rippleDelete',
  marker: 'shortcuts.marker'
}
