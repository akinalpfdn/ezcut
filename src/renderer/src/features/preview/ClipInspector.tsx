import { useTranslation } from 'react-i18next'
import { TRANSITION_TYPES, type TransitionType } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { useDenoiseStore } from '../../stores/denoiseStore'
import { MAX_CLIP_VOLUME } from '../../config/playback'
import { NumberField } from '../../components/NumberField'
import { SliderField } from '../../components/SliderField'
import { SpeedField } from '../../components/SpeedField'
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

      {media?.kind !== 'audio' ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>{t('inspector.transform')}</span>
          <label className={styles.field}>
            <span className={styles.label}>{t('inspector.scale')}</span>
            <SliderField
              min={10}
              max={300}
              value={Math.round(clip.scale * 100)}
              onChange={(value) => useTimelineStore.getState().setClipTransform(clip.id, { scale: value / 100 })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('inspector.posX')}</span>
            <SliderField
              min={-50}
              max={50}
              value={Math.round(clip.posX * 100)}
              onChange={(value) => useTimelineStore.getState().setClipTransform(clip.id, { posX: value / 100 })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('inspector.posY')}</span>
            <SliderField
              min={-50}
              max={50}
              value={Math.round(clip.posY * 100)}
              onChange={(value) => useTimelineStore.getState().setClipTransform(clip.id, { posY: value / 100 })}
            />
          </label>
        </div>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>{t('inspector.speed')}</span>
        <SpeedField value={clip.speed} onChange={(speed) => useTimelineStore.getState().setClipSpeed(clip.id, speed)} />
      </label>

      <button
        type="button"
        className={clip.preservePitch ? `${styles.toggle} ${styles.toggleOn} ${styles.block}` : `${styles.toggle} ${styles.block}`}
        aria-pressed={clip.preservePitch}
        title={t('inspector.preservePitchHint')}
        onClick={() => useTimelineStore.getState().setClipPreservePitch(clip.id, !clip.preservePitch)}
      >
        {t('inspector.preservePitch')}
      </button>

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
        <NumberField
          className={styles.number}
          min={0}
          step={0.1}
          value={clip.fadeIn}
          onCommit={(value) => useTimelineStore.getState().setClipFade(clip.id, { fadeIn: value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('inspector.fadeOut')}</span>
        <NumberField
          className={styles.number}
          min={0}
          step={0.1}
          value={clip.fadeOut}
          onCommit={(value) => useTimelineStore.getState().setClipFade(clip.id, { fadeOut: value })}
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

      <div className={styles.toggleGroup}>
        {(['normalize', 'gate', 'compressor', 'eq'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={clip.audioFx[key] ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
            aria-pressed={clip.audioFx[key]}
            title={t(`inspector.${key}Hint`)}
            onClick={() => useTimelineStore.getState().setClipAudioFx(clip.id, { [key]: !clip.audioFx[key] })}
          >
            {t(`inspector.${key}`)}
          </button>
        ))}
      </div>

      {clip.audioFx.eq
        ? (['eqLow', 'eqMid', 'eqHigh'] as const).map((band) => (
            <label key={band} className={styles.field}>
              <span className={styles.label}>{t(`inspector.${band}`)}</span>
              <NumberField
                className={styles.number}
                step={1}
                value={clip.audioFx[band]}
                onCommit={(value) => useTimelineStore.getState().setClipAudioFx(clip.id, { [band]: value })}
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

      {clip.transitionOut ? (
        <>
          <span className={styles.fxLabel}>{t('transition.label')}</span>
          <label className={styles.field}>
            <select
              className={styles.select}
              value={clip.transitionOut.type}
              onChange={(event) =>
                useTimelineStore.getState().setTransitionType(clip.id, event.target.value as TransitionType)
              }
            >
              {TRANSITION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`transition.${type}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('transition.duration')}</span>
            <NumberField
              className={styles.number}
              min={0.1}
              step={0.1}
              value={clip.transitionOut.duration}
              onCommit={(value) => useTimelineStore.getState().setTransitionDuration(clip.id, value)}
            />
          </label>
          <button
            type="button"
            className={`${styles.toggle} ${styles.toggleActive}`}
            onClick={() => useTimelineStore.getState().removeTransition(clip.id)}
          >
            {t('transition.remove')}
          </button>
        </>
      ) : null}
    </div>
  )
}
