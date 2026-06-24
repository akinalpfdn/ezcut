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

      <label className={styles.field}>
        <span className={styles.label}>{t('inspector.fadeIn')}</span>
        <input
          className={styles.number}
          type="number"
          min={0}
          step={0.1}
          value={clip.fadeIn}
          onChange={(event) => useTimelineStore.getState().setClipFade(clip.id, { fadeIn: Number(event.target.value) })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('inspector.fadeOut')}</span>
        <input
          className={styles.number}
          type="number"
          min={0}
          step={0.1}
          value={clip.fadeOut}
          onChange={(event) => useTimelineStore.getState().setClipFade(clip.id, { fadeOut: Number(event.target.value) })}
        />
      </label>

      <button
        type="button"
        className={clip.muted ? `${styles.toggle} ${styles.toggleActive}` : styles.toggle}
        aria-pressed={clip.muted}
        onClick={() => useTimelineStore.getState().toggleClipMute(clip.id)}
      >
        {clip.muted ? t('inspector.muted') : t('inspector.mute')}
      </button>

      <span className={styles.fxLabel} title={t('inspector.fxHint')}>
        {t('inspector.fx')}
      </span>

      {(['normalize', 'gate', 'compressor', 'eq'] as const).map((key) => (
        <button
          key={key}
          type="button"
          className={clip.audioFx[key] ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
          aria-pressed={clip.audioFx[key]}
          onClick={() => useTimelineStore.getState().setClipAudioFx(clip.id, { [key]: !clip.audioFx[key] })}
        >
          {t(`inspector.${key}`)}
        </button>
      ))}

      {clip.audioFx.eq
        ? (['eqLow', 'eqMid', 'eqHigh'] as const).map((band) => (
            <label key={band} className={styles.field}>
              <span className={styles.label}>{t(`inspector.${band}`)}</span>
              <input
                className={styles.number}
                type="number"
                step={1}
                value={clip.audioFx[band]}
                onChange={(event) =>
                  useTimelineStore.getState().setClipAudioFx(clip.id, { [band]: Number(event.target.value) })
                }
              />
            </label>
          ))
        : null}

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
