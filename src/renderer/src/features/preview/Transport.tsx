import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@shared'
import type { PreviewEngine } from './usePreviewEngine'
import { PLAYBACK_SPEEDS } from '../../config/playback'
import { formatTimecode } from '../../utils/timecode'
import styles from './Transport.module.css'

interface TransportProps {
  engine: PreviewEngine
  item: MediaItem
}

export function Transport({ engine, item }: TransportProps) {
  const { t } = useTranslation()
  const fps = item.kind === 'video' ? item.fps : undefined
  const max = engine.duration || 0

  return (
    <div className={styles.transport}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          aria-label={t('transport.prevFrame')}
          title={t('transport.prevFrame')}
          onClick={() => engine.stepFrames(-1)}
        >
          ⏮
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.play}`}
          aria-label={engine.isPlaying ? t('transport.pause') : t('transport.play')}
          title={engine.isPlaying ? t('transport.pause') : t('transport.play')}
          onClick={engine.togglePlay}
        >
          {engine.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className={styles.button}
          aria-label={t('transport.nextFrame')}
          title={t('transport.nextFrame')}
          onClick={() => engine.stepFrames(1)}
        >
          ⏭
        </button>
      </div>

      <div className={styles.timecode}>
        <span>{formatTimecode(engine.currentTime, fps)}</span>
        <span className={styles.sep}>/</span>
        <span className={styles.muted}>{formatTimecode(engine.duration, fps)}</span>
      </div>

      <input
        className={styles.scrub}
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={Math.min(engine.currentTime, max)}
        onChange={(event) => engine.seek(Number(event.target.value))}
        aria-label={t('transport.seek')}
      />

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('transport.speed')}</span>
        <select
          className={styles.select}
          value={engine.speed}
          onChange={(event) => engine.setSpeed(Number(event.target.value))}
        >
          {PLAYBACK_SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('transport.volume')}</span>
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={engine.volume}
          onChange={(event) => engine.setVolume(Number(event.target.value))}
          aria-label={t('transport.volume')}
        />
      </label>
    </div>
  )
}
