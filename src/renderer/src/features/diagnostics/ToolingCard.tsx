import { useTranslation } from 'react-i18next'
import { Panel } from '../../components/Panel/Panel'
import { ErrorNotice } from '../../components/ErrorNotice'
import { useToolingInfo } from '../../hooks/useToolingInfo'
import styles from './ToolingCard.module.css'

function ToolRow({ name, version, path }: { name: string; version: string; path: string }) {
  const { t } = useTranslation()
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.toolName}>{name}</span>
        <span className={styles.badge}>{t('diagnostics.statusOk')}</span>
      </div>
      <dl className={styles.meta}>
        <dt className={styles.term}>{t('diagnostics.version')}</dt>
        <dd className={styles.mono}>{version}</dd>
        <dt className={styles.term}>{t('diagnostics.path')}</dt>
        <dd className={styles.path}>{path}</dd>
      </dl>
    </div>
  )
}

export function ToolingCard() {
  const { t } = useTranslation()
  const { loading, info, error, reload } = useToolingInfo()

  return (
    <Panel title={t('diagnostics.toolingTitle')} description={t('diagnostics.toolingDescription')}>
      {loading ? <p className={styles.muted}>{t('diagnostics.loading')}</p> : null}
      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      {info ? (
        <div className={styles.grid}>
          <ToolRow name="ffmpeg" version={info.ffmpegVersion} path={info.ffmpegPath} />
          <ToolRow name="ffprobe" version={info.ffprobeVersion} path={info.ffprobePath} />
        </div>
      ) : null}
    </Panel>
  )
}
