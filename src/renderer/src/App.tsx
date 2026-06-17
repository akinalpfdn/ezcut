import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { MediaBin } from './features/mediaBin/MediaBin'
import { Preview } from './features/preview/Preview'
import { Timeline } from './features/timeline/Timeline'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { useKeyboardShortcuts } from './features/shortcuts/useKeyboardShortcuts'
import { useKeymapStore } from './stores/keymapStore'
import { settingsService } from './services/settingsService'
import styles from './App.module.css'

export function App() {
  const { t } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  useKeyboardShortcuts()

  // Load persisted settings (keymap) once on startup.
  useEffect(() => {
    void settingsService.load().then((result) => {
      if (result.ok && result.value?.keymap) useKeymapStore.getState().loadKeymap(result.value.keymap)
    })
  }, [])

  // Prevent the window from navigating to a file dropped outside a drop zone.
  useEffect(() => {
    const prevent = (event: DragEvent): void => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>{t('app.title')}</span>
          <span className={styles.tagline}>{t('app.tagline')}</span>
        </div>
        <div className={styles.headerActions}>
          <LanguageSwitcher />
          <button
            type="button"
            className={styles.settingsButton}
            aria-label={t('settings.open')}
            title={t('settings.open')}
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </div>
      </header>

      <main className={styles.workspace}>
        <div className={styles.top}>
          <MediaBin />
          <Preview />
        </div>
        <Timeline />
      </main>

      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  )
}
