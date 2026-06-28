import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppErrorPayload, ExportCodec, ExportContainer, QualityPreset } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { exportService } from '../../services/exportService'
import {
  DEFAULT_EXPORT,
  EXPORT_CODECS,
  EXPORT_CONTAINERS,
  EXPORT_FPS_OPTIONS,
  QUALITY_PRESETS,
  RESOLUTION_PRESETS
} from '../../config/export'
import { Button } from '../../components/Button/Button'
import { ErrorNotice } from '../../components/ErrorNotice'
import styles from './ExportDialog.module.css'

interface ExportDialogProps {
  onClose: () => void
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const { t } = useTranslation()
  const hasClips = useTimelineStore((state) => Object.keys(state.model.clips).length > 0)
  const sourceVideo = useMediaStore(
    (state) =>
      state.items.find(
        (item) => (item.kind === 'video' || item.kind === 'image') && item.width && item.height
      ) ?? null
  )
  const source = {
    width: sourceVideo?.width ?? DEFAULT_EXPORT.width,
    height: sourceVideo?.height ?? DEFAULT_EXPORT.height
  }

  const [container, setContainer] = useState<ExportContainer>(DEFAULT_EXPORT.container)
  const [codec, setCodec] = useState<ExportCodec>(DEFAULT_EXPORT.codec)
  const [resolutionId, setResolutionId] = useState('source')
  const [customWidth, setCustomWidth] = useState(source.width)
  const [customHeight, setCustomHeight] = useState(source.height)
  const [fps, setFps] = useState(DEFAULT_EXPORT.fps)
  const [quality, setQuality] = useState<QualityPreset>(DEFAULT_EXPORT.quality)

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [error, setError] = useState<AppErrorPayload | null>(null)
  const cancelledRef = useRef(false)

  function resolveSize(): { width: number; height: number } {
    if (resolutionId === 'source') return source
    if (resolutionId === 'custom') return { width: customWidth, height: customHeight }
    const preset = RESOLUTION_PRESETS.find((entry) => entry.id === resolutionId)
    return { width: preset?.width ?? source.width, height: preset?.height ?? source.height }
  }

  async function handleExport(): Promise<void> {
    const pathResult = await exportService.selectPath(container)
    if (!pathResult.ok) {
      setError(pathResult.error)
      return
    }
    if (!pathResult.value) return

    setOutputPath(pathResult.value)
    const { width, height } = resolveSize()
    cancelledRef.current = false
    setExporting(true)
    setProgress(0)
    setDone(false)
    setError(null)

    const unsubscribe = exportService.onProgress((value) => setProgress(value.ratio))
    const result = await exportService.start({
      model: useTimelineStore.getState().model,
      media: useMediaStore.getState().items,
      options: { container, codec, width, height, fps, quality },
      outputPath: pathResult.value
    })
    unsubscribe()
    setExporting(false)

    if (cancelledRef.current) return
    if (result.ok) setDone(true)
    else setError(result.error)
  }

  function handleCancel(): void {
    cancelledRef.current = true
    void exportService.cancel()
    setExporting(false)
  }

  return (
    <div className={styles.backdrop} onClick={exporting ? undefined : onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('export.title')}</h2>
          <button type="button" className={styles.close} aria-label={t('export.close')} onClick={onClose}>
            ×
          </button>
        </header>

        {!hasClips ? (
          <p className={styles.empty}>{t('export.empty')}</p>
        ) : (
          <>
            <div className={styles.rows}>
              <label className={styles.row}>
                <span className={styles.label}>{t('export.container')}</span>
                <select
                  className={styles.select}
                  value={container}
                  disabled={exporting}
                  onChange={(event) => setContainer(event.target.value as ExportContainer)}
                >
                  {EXPORT_CONTAINERS.map((value) => (
                    <option key={value} value={value}>
                      {value.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.row}>
                <span className={styles.label}>{t('export.codec')}</span>
                <select
                  className={styles.select}
                  value={container === 'webm' ? 'h264' : codec}
                  disabled={exporting || container === 'webm'}
                  onChange={(event) => setCodec(event.target.value as ExportCodec)}
                >
                  {container === 'webm' ? (
                    <option value="h264">VP9</option>
                  ) : (
                    EXPORT_CODECS.map((value) => (
                      <option key={value} value={value}>
                        {t(`codec.${value}`)}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className={styles.row}>
                <span className={styles.label}>{t('export.resolution')}</span>
                <select
                  className={styles.select}
                  value={resolutionId}
                  disabled={exporting}
                  onChange={(event) => setResolutionId(event.target.value)}
                >
                  {RESOLUTION_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.id === 'source'
                        ? t('export.source')
                        : preset.id === 'custom'
                          ? t('export.custom')
                          : preset.id}
                    </option>
                  ))}
                </select>
              </label>

              {resolutionId === 'custom' ? (
                <div className={styles.row}>
                  <span className={styles.label}>{t('export.size')}</span>
                  <div className={styles.customSize}>
                    <input
                      className={styles.number}
                      type="number"
                      min={16}
                      value={customWidth}
                      disabled={exporting}
                      onChange={(event) => setCustomWidth(Number(event.target.value))}
                    />
                    <span className={styles.times}>×</span>
                    <input
                      className={styles.number}
                      type="number"
                      min={16}
                      value={customHeight}
                      disabled={exporting}
                      onChange={(event) => setCustomHeight(Number(event.target.value))}
                    />
                  </div>
                </div>
              ) : null}

              <label className={styles.row}>
                <span className={styles.label}>{t('export.fps')}</span>
                <select
                  className={styles.select}
                  value={fps}
                  disabled={exporting}
                  onChange={(event) => setFps(Number(event.target.value))}
                >
                  {EXPORT_FPS_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.row}>
                <span className={styles.label}>{t('export.quality')}</span>
                <select
                  className={styles.select}
                  value={quality}
                  disabled={exporting}
                  onChange={(event) => setQuality(event.target.value as QualityPreset)}
                >
                  {QUALITY_PRESETS.map((value) => (
                    <option key={value} value={value}>
                      {t(`quality.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {exporting ? (
              <div className={styles.progress}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <span className={styles.progressLabel}>{Math.round(progress * 100)}%</span>
              </div>
            ) : null}

            {done ? (
              <div className={styles.doneRow}>
                <p className={styles.done}>{t('export.done')}</p>
                {outputPath ? (
                  <Button variant="ghost" onClick={() => void exportService.showInFolder(outputPath)}>
                    {t('export.openFolder')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {error ? <ErrorNotice error={error} /> : null}

            <footer className={styles.footer}>
              {exporting ? (
                <Button variant="ghost" onClick={handleCancel}>
                  {t('export.cancel')}
                </Button>
              ) : (
                <Button onClick={() => void handleExport()}>{t('export.start')}</Button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
