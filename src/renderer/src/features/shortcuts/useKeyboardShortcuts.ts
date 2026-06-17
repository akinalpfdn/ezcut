import { useEffect } from 'react'
import { useKeymapStore } from '../../stores/keymapStore'
import { useTimelineStore } from '../../stores/timelineStore'
import { actionForCombo, comboFromEvent } from './keyCombo'
import { deleteSelected, splitSelected, stepFrames } from '../timeline/editorActions'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

/** Routes global keydown through the active keymap. Ignored while typing in an
 * input or while the settings panel is capturing a rebind. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const keymapState = useKeymapStore.getState()
      if (keymapState.capturing || isTypingTarget(event.target)) return

      const action = actionForCombo(keymapState.keymap, comboFromEvent(event))
      if (!action) return
      event.preventDefault()

      const store = useTimelineStore.getState()
      switch (action) {
        case 'playPause':
          store.togglePlay()
          break
        case 'split':
          splitSelected()
          break
        case 'delete':
          deleteSelected()
          break
        case 'frameBack':
          stepFrames(-1)
          break
        case 'frameForward':
          stepFrames(1)
          break
        case 'undo':
          store.undo()
          break
        case 'redo':
          store.redo()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
