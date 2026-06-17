import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { MAX_CLIP_VOLUME, PLAYBACK_SPEEDS } from '../../config/playback'
import styles from './ClipInspector.module.css'

export function ClipInspector() {
  const { t } = useTranslation()
  const clip = useTimelineStore((state) =>
    state.selectedClipId ? (state.model.clips[state.selectedClipId] ?? null) : null
  )
  const name = useMediaStore((state) =>
    clip ? (state.items.find((item) => item.id === clip.mediaId)?.name ?? null) : null
  )

  if (!clip) return null

  return (
    <div className={styles.inspector}>
      <span className={styles.name} title={name ?? undefined}>
        {name ?? '—'}
      </span>

      <label className={styles.field}>
        <span className={styles.label}>{t('inspector.speed')}</span>
        <select
          className={styles.select}
          value={clip.speed}
          onChange={(event) => useTimelineStore.getState().setClipSpeed(clip.id, Number(event.target.value))}
        >
          {PLAYBACK_SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('inspector.volume')}</span>
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={MAX_CLIP_VOLUME}
          step={0.05}
          value={clip.volume}
          onChange={(event) => useTimelineStore.getState().setClipVolume(clip.id, Number(event.target.value))}
        />
        <span className={styles.value}>{Math.round(clip.volume * 100)}%</span>
      </label>
    </div>
  )
}
