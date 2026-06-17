import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KEYMAP_ACTIONS, type KeymapAction } from '@shared'
import { useKeymapStore } from '../../stores/keymapStore'
import { KEYMAP_ACTION_LABEL_KEYS } from '../../config/keymap'
import { comboFromEvent, formatCombo, isModifierOnly } from '../shortcuts/keyCombo'
import { Button } from '../../components/Button/Button'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
}

interface Conflict {
  action: KeymapAction
  existing: KeymapAction
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useTranslation()
  const keymap = useKeymapStore((state) => state.keymap)
  const [capturing, setCapturing] = useState<KeymapAction | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  useEffect(() => {
    if (!capturing) return
    const action = capturing
    useKeymapStore.getState().setCapturing(true)

    function onKeyDown(event: KeyboardEvent): void {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (isModifierOnly(event)) return
      const existing = useKeymapStore.getState().rebind(action, comboFromEvent(event))
      setConflict(existing ? { action, existing } : null)
      setCapturing(null)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      useKeymapStore.getState().setCapturing(false)
    }
  }, [capturing])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('settings.title')}</h2>
          <button type="button" className={styles.close} aria-label={t('settings.close')} onClick={onClose}>
            ×
          </button>
        </header>

        <p className={styles.subtitle}>{t('settings.shortcutsHint')}</p>

        <div className={styles.rows}>
          {KEYMAP_ACTIONS.map((action) => (
            <div key={action} className={styles.row}>
              <span className={styles.action}>{t(KEYMAP_ACTION_LABEL_KEYS[action])}</span>
              <button
                type="button"
                className={capturing === action ? `${styles.binding} ${styles.capturing}` : styles.binding}
                onClick={() => setCapturing(action)}
              >
                {capturing === action ? t('settings.pressKey') : formatCombo(keymap[action])}
              </button>
            </div>
          ))}
        </div>

        {conflict ? (
          <p className={styles.conflict} role="alert">
            {t('settings.conflict', {
              binding: formatCombo(keymap[conflict.existing]),
              action: t(KEYMAP_ACTION_LABEL_KEYS[conflict.existing])
            })}
          </p>
        ) : null}

        <footer className={styles.footer}>
          <Button variant="ghost" onClick={() => useKeymapStore.getState().resetDefaults()}>
            {t('settings.reset')}
          </Button>
          <Button onClick={onClose}>{t('settings.done')}</Button>
        </footer>
      </div>
    </div>
  )
}
