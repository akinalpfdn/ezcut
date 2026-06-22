import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { Button } from './components/Button/Button'
import { MediaBin } from './features/mediaBin/MediaBin'
import { Preview } from './features/preview/Preview'
import { Timeline } from './features/timeline/Timeline'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { ExportDialog } from './features/export/ExportDialog'
import { WebCodecsLab } from './features/preview/webcodecs/WebCodecsLab'
import { useKeyboardShortcuts } from './features/shortcuts/useKeyboardShortcuts'
import { useAutosave } from './features/project/useAutosave'
import { applyProject, openProject, saveCurrentProject } from './features/project/projectActions'
import { autosaveGate } from './features/project/autosaveGate'
import { useKeymapStore } from './stores/keymapStore'
import { settingsService } from './services/settingsService'
import { projectService } from './services/projectService'
import styles from './App.module.css'

export function App() {
  const { t } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [labOpen, setLabOpen] = useState(false)
  useKeyboardShortcuts()
  useAutosave()

  // Load persisted settings and restore the last session on startup.
  useEffect(() => {
    void settingsService.load().then((result) => {
      if (result.ok && result.value?.keymap) useKeymapStore.getState().loadKeymap(result.value.keymap)
    })
    void projectService.loadAutosave().then((result) => {
      if (result.ok && result.value) applyProject(result.value)
      // Enable autosave only after the restore ran, so deletions (incl. emptying
      // the project) are now persisted instead of being reverted on refresh.
      autosaveGate.open()
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
          <Button variant="ghost" onClick={() => void saveCurrentProject()}>
            {t('project.save')}
          </Button>
          <Button variant="ghost" onClick={() => void openProject()}>
            {t('project.open')}
          </Button>
          <Button onClick={() => setExportOpen(true)}>{t('export.title')}</Button>
          <button
            type="button"
            className={styles.settingsButton}
            aria-label={t('webcodecs.open')}
            title={t('webcodecs.open')}
            onClick={() => setLabOpen(true)}
          >
            🧪
          </button>
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
      {exportOpen ? <ExportDialog onClose={() => setExportOpen(false)} /> : null}
      {labOpen ? <WebCodecsLab onClose={() => setLabOpen(false)} /> : null}
    </div>
  )
}
