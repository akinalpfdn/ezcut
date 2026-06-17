import { useTranslation } from 'react-i18next'
import { timelineDuration } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { stepFrames } from '../timeline/editorActions'
import { formatTimecode } from '../../utils/timecode'
import styles from './Transport.module.css'

export function Transport() {
  const { t } = useTranslation()
  const isPlaying = useTimelineStore((state) => state.isPlaying)
  const playheadTime = useTimelineStore((state) => state.playheadTime)
  const masterVolume = useTimelineStore((state) => state.masterVolume)
  const duration = useTimelineStore((state) => timelineDuration(state.model))

  const max = duration || 0

  return (
    <div className={styles.transport}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          aria-label={t('transport.prevFrame')}
          title={t('transport.prevFrame')}
          onClick={() => stepFrames(-1)}
        >
          ⏮
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.play}`}
          aria-label={isPlaying ? t('transport.pause') : t('transport.play')}
          title={isPlaying ? t('transport.pause') : t('transport.play')}
          onClick={() => useTimelineStore.getState().togglePlay()}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className={styles.button}
          aria-label={t('transport.nextFrame')}
          title={t('transport.nextFrame')}
          onClick={() => stepFrames(1)}
        >
          ⏭
        </button>
      </div>

      <div className={styles.timecode}>
        <span>{formatTimecode(playheadTime)}</span>
        <span className={styles.sep}>/</span>
        <span className={styles.muted}>{formatTimecode(duration)}</span>
      </div>

      <input
        className={styles.scrub}
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={Math.min(playheadTime, max)}
        onChange={(event) => useTimelineStore.getState().setPlayhead(Number(event.target.value))}
        aria-label={t('transport.seek')}
      />

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('transport.volume')}</span>
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(event) => useTimelineStore.getState().setMasterVolume(Number(event.target.value))}
          aria-label={t('transport.volume')}
        />
      </label>
    </div>
  )
}
