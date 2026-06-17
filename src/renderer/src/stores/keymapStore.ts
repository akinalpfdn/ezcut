import { create } from 'zustand'
import type { Keymap, KeymapAction } from '@shared'
import { DEFAULT_KEYMAP } from '../config/keymap'
import { settingsService } from '../services/settingsService'

interface KeymapState {
  keymap: Keymap
  /** True while the settings panel is waiting to capture a new binding, so global
   * shortcuts ignore the captured keystroke. */
  capturing: boolean
  loadKeymap: (keymap: Partial<Keymap>) => void
  /** Returns the conflicting action if the combo is already bound elsewhere, else null. */
  rebind: (action: KeymapAction, combo: string) => KeymapAction | null
  resetDefaults: () => void
  setCapturing: (capturing: boolean) => void
}

function persist(keymap: Keymap): void {
  void settingsService.save({ keymap })
}

export const useKeymapStore = create<KeymapState>((set, get) => ({
  keymap: DEFAULT_KEYMAP,
  capturing: false,

  loadKeymap: (keymap) => set({ keymap: { ...DEFAULT_KEYMAP, ...keymap } }),

  rebind: (action, combo) => {
    const current = get().keymap
    const conflict = (Object.keys(current) as KeymapAction[]).find(
      (other) => other !== action && current[other] === combo
    )
    if (conflict) return conflict
    const keymap = { ...current, [action]: combo }
    set({ keymap })
    persist(keymap)
    return null
  },

  resetDefaults: () => {
    set({ keymap: DEFAULT_KEYMAP })
    persist(DEFAULT_KEYMAP)
  },

  setCapturing: (capturing) => set({ capturing })
}))
