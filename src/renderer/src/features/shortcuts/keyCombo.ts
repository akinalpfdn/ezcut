import type { Keymap, KeymapAction } from '@shared'

const MODIFIER_CODES = [
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight'
]

/** Builds a normalized combo string from a keyboard event using physical key
 * codes (layout-independent), e.g. "Ctrl+Shift+KeyZ", "Space". */
export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(event.code)
  return parts.join('+')
}

/** True while only a modifier is held (no main key yet) — ignored during capture. */
export function isModifierOnly(event: KeyboardEvent): boolean {
  return MODIFIER_CODES.includes(event.code)
}

function formatToken(token: string): string {
  if (token.startsWith('Key')) return token.slice(3)
  if (token.startsWith('Digit')) return token.slice(5)
  if (token.startsWith('Arrow')) return token.slice(5)
  if (token === 'Escape') return 'Esc'
  return token
}

/** Human-readable combo, e.g. "Ctrl+Shift+KeyZ" → "Ctrl + Shift + Z". */
export function formatCombo(combo: string): string {
  return combo.split('+').map(formatToken).join(' + ')
}

export function actionForCombo(keymap: Keymap, combo: string): KeymapAction | null {
  for (const action of Object.keys(keymap) as KeymapAction[]) {
    if (keymap[action] === combo) return action
  }
  return null
}
