import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { useDenoiseStore } from '../../stores/denoiseStore'
import { MAX_CLIP_VOLUME, PLAYBACK_SPEEDS } from '../../config/playback'
import styles from './ClipInspector.module.css'

export function ClipInspector() {
  const { t } = useTranslation()
  const clip = useTimelineStore((state) =>
    state.selectedClipId ? (state.model.clips[state.selectedClipId] ?? null) : null
  )
  const media = useMediaStore((state) =>
    clip ? (state.items.find((item) => item.id === clip.mediaId) ?? null) : null
  )
  const generating = useDenoiseStore((state) =>
    clip?.denoise.enabled && media ? state.getProxyPath(media.path, clip.denoise.strength) === null : false
  )

  if (!clip) return null

  const setDenoiseStrength = (strength: number): void => {
    useTimelineStore.getState().setClipDenoise(clip.id, { strength })
    if (clip.denoise.enabled && media) useDenoiseStore.getState().ensureProxy(media.path, strength)
  }

  return (
    <div className={styles.inspector}>
      <span className={styles.name} title={media?.name}>
        {media?.name ?? '—'}
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

      {clip.denoise.enabled ? (
        <label className={styles.field}>
          <span className={styles.label}>{t('inspector.denoiseStrength')}</span>
          <input
            className={styles.volume}
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={clip.denoise.strength}
            onChange={(event) => setDenoiseStrength(Number(event.target.value))}
          />
          <span className={styles.value}>
            {generating ? t('inspector.generating') : `${Math.round(clip.denoise.strength * 100)}%`}
          </span>
        </label>
      ) : null}
    </div>
  )
}
