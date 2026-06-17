import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { ToolingCard } from './features/diagnostics/ToolingCard'
import { ProbePanel } from './features/diagnostics/ProbePanel'
import styles from './App.module.css'

export function App() {
  const { t } = useTranslation()

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
        <ToolingCard />
        <ProbePanel />
      </main>
    </div>
  )
}
