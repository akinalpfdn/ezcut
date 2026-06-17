import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n'
import styles from './LanguageSwitcher.module.css'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  return (
    <div className={styles.group} role="group" aria-label={t('language.label')}>
      {SUPPORTED_LANGUAGES.map((language) => {
        const active = language === i18n.resolvedLanguage
        return (
          <button
            key={language}
            type="button"
            className={active ? `${styles.option} ${styles.active}` : styles.option}
            aria-pressed={active}
            onClick={() => void i18n.changeLanguage(language)}
          >
            {t(`language.${language}`)}
          </button>
        )
      })}
    </div>
  )
}
