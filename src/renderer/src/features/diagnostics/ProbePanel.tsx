import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppErrorPayload, MediaProbeResult } from '@shared'
import { Panel } from '../../components/Panel/Panel'
import { Button } from '../../components/Button/Button'
import { ErrorNotice } from '../../components/ErrorNotice'
import { mediaService } from '../../services/mediaService'
import { formatBytes, formatDuration } from '../../utils/format'
import styles from './ProbePanel.module.css'

function ProbeResultView({ result }: { result: MediaProbeResult }) {
  const { t } = useTranslation()
  const resolution = result.width && result.height ? `${result.width}×${result.height}` : '—'

  return (
    <dl className={styles.meta}>
      <dt className={styles.term}>{t('probe.fields.format')}</dt>
      <dd className={styles.mono}>{result.formatName}</dd>
      <dt className={styles.term}>{t('probe.fields.duration')}</dt>
      <dd className={styles.value}>{formatDuration(result.durationSeconds)}</dd>
      <dt className={styles.term}>{t('probe.fields.size')}</dt>
      <dd className={styles.value}>{formatBytes(result.sizeBytes)}</dd>
      <dt className={styles.term}>{t('probe.fields.video')}</dt>
      <dd className={styles.value}>{result.hasVideo ? t('probe.yes') : t('probe.no')}</dd>
      <dt className={styles.term}>{t('probe.fields.audio')}</dt>
      <dd className={styles.value}>{result.hasAudio ? t('probe.yes') : t('probe.no')}</dd>
      {result.hasVideo ? (
        <>
          <dt className={styles.term}>{t('probe.fields.resolution')}</dt>
          <dd className={styles.value}>{resolution}</dd>
        </>
      ) : null}
      {result.fps ? (
        <>
          <dt className={styles.term}>{t('probe.fields.fps')}</dt>
          <dd className={styles.value}>{result.fps}</dd>
        </>
      ) : null}
    </dl>
  )
}

export function ProbePanel() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MediaProbeResult | null>(null)
  const [error, setError] = useState<AppErrorPayload | null>(null)

  async function handleSelect() {
    setBusy(true)
    setError(null)
    const opened = await mediaService.openMediaFileDialog()
    if (!opened.ok) {
      setError(opened.error)
      setBusy(false)
      return
    }
    if (opened.value === null) {
      setBusy(false)
      return
    }
    const probed = await mediaService.probe(opened.value)
    if (probed.ok) {
      setResult(probed.value)
      setError(null)
    } else {
      setError(probed.error)
    }
    setBusy(false)
  }

  return (
    <Panel title={t('probe.title')} description={t('probe.description')}>
      <div>
        <Button onClick={() => void handleSelect()} disabled={busy}>
          {busy ? t('probe.probing') : t('probe.selectButton')}
        </Button>
      </div>
      {error ? <ErrorNotice error={error} /> : null}
      {result ? <ProbeResultView result={result} /> : null}
      {!result && !error ? <p className={styles.muted}>{t('probe.empty')}</p> : null}
    </Panel>
  )
}
