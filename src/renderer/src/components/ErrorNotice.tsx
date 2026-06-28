import { useTranslation } from 'react-i18next'
import type { AppErrorPayload } from '@shared'
import { Button } from './Button/Button'
import styles from './ErrorNotice.module.css'

interface ErrorNoticeProps {
  error: AppErrorPayload
  onRetry?: () => void
}

export function ErrorNotice({ error, onRetry }: ErrorNoticeProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.notice} role="alert">
      <p className={styles.message}>{t(error.messageKey, error.params)}</p>
      {error.detail ? (
        <details className={styles.details}>
          <summary className={styles.summary}>{t('common.detail')}</summary>
          <pre className={styles.detailText}>{error.detail}</pre>
          <Button
            variant="ghost"
            onClick={() => void navigator.clipboard.writeText(`[${error.code}] ${error.detail ?? ''}`)}
          >
            {t('common.copy')}
          </Button>
        </details>
      ) : null}
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}
