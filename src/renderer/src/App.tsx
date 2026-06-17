import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { MediaBin } from './features/mediaBin/MediaBin'
import { Preview } from './features/preview/Preview'
import styles from './App.module.css'

export function App() {
  const { t } = useTranslation()

  // Prevent the window from navigating to a file when one is dropped outside a
  // designated drop zone (the Media Bin handles its own drops).
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault()
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
        <LanguageSwitcher />
      </header>

      <main className={styles.main}>
        <MediaBin />
        <Preview />
      </main>
    </div>
  )
}
