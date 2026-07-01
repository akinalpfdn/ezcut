import { useTranslation } from 'react-i18next'
import {
  BUBBLE_SHAPES,
  FILL_TYPES,
  FONT_FAMILIES,
  TEXT_ALIGNS,
  TEXT_ANIMATIONS,
  TEXT_EFFECTS,
  type FillType,
  type TextAnimation,
  type TextOverlay
} from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { NumberField } from '../../components/NumberField'
import { ColorField } from '../../components/ColorField'
import { SliderField } from '../../components/SliderField'
import { useSystemFonts } from './useSystemFonts'
import styles from './ClipInspector.module.css'

/** Inspector shown when a text overlay is selected (mutually exclusive with the
 * clip inspector). Edits content + basic style; rendering happens in the compositor. */
export function TextInspector() {
  const { t } = useTranslation()
  const systemFonts = useSystemFonts()
  const overlay = useTimelineStore((state) =>
    state.selectedOverlayId
      ? (state.model.textOverlays.find((candidate) => candidate.id === state.selectedOverlayId) ?? null)
      : null
  )

  if (!overlay) return null

  const update = (patch: Partial<TextOverlay>): void => useTimelineStore.getState().updateTextOverlay(overlay.id, patch)

  const effectShowsColor = ['shadow', 'outline', 'splice', 'echo', 'glitch', 'neon'].includes(overlay.effect)
  const effectShowsDirection = ['shadow', 'echo', 'glitch', 'splice'].includes(overlay.effect)

  const animOptions = (
    <>
      {TEXT_ANIMATIONS.map((anim) => (
        <option key={anim} value={anim}>
          {t(`anim.${anim}`)}
        </option>
      ))}
    </>
  )

  return (
    <div className={styles.inspector}>
      <textarea
        className={styles.textArea}
        rows={2}
        value={overlay.text}
        placeholder={t('textInspector.placeholder')}
        onChange={(event) => update({ text: event.target.value })}
      />

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t('textInspector.grpStyle')}</span>

        <label className={styles.field}>
          <span className={styles.label}>{t('textInspector.font')}</span>
          <select
            className={styles.select}
            value={overlay.fontFamily}
            onChange={(event) => update({ fontFamily: event.target.value })}
          >
            <optgroup label={t('textInspector.genericFonts')}>
              {FONT_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {t(`fontFamily.${family}`)}
                </option>
              ))}
            </optgroup>
            {systemFonts.length > 0 ? (
              <optgroup label={t('textInspector.systemFonts')}>
                {systemFonts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        <div className={styles.alignRow}>
          <button
            type="button"
            className={overlay.bold ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
            aria-pressed={overlay.bold}
            onClick={() => update({ bold: !overlay.bold })}
          >
            {t('textInspector.bold')}
          </button>
          <button
            type="button"
            className={overlay.italic ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
            aria-pressed={overlay.italic}
            onClick={() => update({ italic: !overlay.italic })}
          >
            {t('textInspector.italic')}
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('textInspector.size')}</span>
          <NumberField
            className={styles.number}
            min={1}
            step={1}
            value={Math.round(overlay.fontSize * 100)}
            onCommit={(value) => update({ fontSize: value / 100 })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('textInspector.fill')}</span>
          <select
            className={styles.select}
            value={overlay.fillType}
            // options are exactly the FillType union members
            onChange={(event) => update({ fillType: event.target.value as FillType })}
          >
            {FILL_TYPES.map((fillType) => (
              <option key={fillType} value={fillType}>
                {t(`fillType.${fillType}`)}
              </option>
            ))}
          </select>
        </label>

        {overlay.fillType === 'solid' ? (
          <label className={styles.field}>
            <span className={styles.label}>{t('textInspector.color')}</span>
            <ColorField value={overlay.color} onChange={(color) => update({ color })} />
          </label>
        ) : (
          <>
            <label className={styles.field}>
              <span className={styles.label}>{t('textInspector.gradFrom')}</span>
              <ColorField value={overlay.gradientFrom} onChange={(gradientFrom) => update({ gradientFrom })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('textInspector.gradTo')}</span>
              <ColorField value={overlay.gradientTo} onChange={(gradientTo) => update({ gradientTo })} />
            </label>
            {overlay.fillType === 'linear' ? (
              <label className={styles.field}>
                <span className={styles.label}>{t('textInspector.gradAngle')}</span>
                <SliderField
                  min={0}
                  max={360}
                  value={Math.round(overlay.gradientAngle)}
                  onChange={(value) => update({ gradientAngle: value })}
                />
              </label>
            ) : null}
          </>
        )}

        <label className={styles.field}>
          <span className={styles.label}>{t('textInspector.opacity')}</span>
          <SliderField
            value={Math.round(overlay.opacity * 100)}
            onChange={(value) => update({ opacity: Math.min(1, Math.max(0, value / 100)) })}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>{t('textInspector.align')}</span>
          <div className={styles.alignRow}>
            {TEXT_ALIGNS.map((align) => (
              <button
                key={align}
                type="button"
                className={overlay.align === align ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
                aria-pressed={overlay.align === align}
                onClick={() => update({ align })}
              >
                {t(`align.${align}`)}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('textInspector.rotation')}</span>
          <SliderField
            min={-180}
            max={180}
            value={Math.round(overlay.rotation)}
            onChange={(value) => update({ rotation: value })}
          />
        </label>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t('textInspector.grpBox')}</span>
        <button
          type="button"
          className={
            overlay.background ? `${styles.toggle} ${styles.toggleOn} ${styles.block}` : `${styles.toggle} ${styles.block}`
          }
          aria-pressed={overlay.background}
          onClick={() => update({ background: !overlay.background })}
        >
          {t('textInspector.box')}
        </button>

        {overlay.background ? (
          <>
            <div className={styles.effectGrid}>
              {BUBBLE_SHAPES.map((shape) => (
                <button
                  key={shape}
                  type="button"
                  className={overlay.bubble === shape ? `${styles.effectCell} ${styles.toggleOn}` : styles.effectCell}
                  aria-pressed={overlay.bubble === shape}
                  onClick={() => update({ bubble: shape })}
                >
                  {t(`bubble.${shape}`)}
                </button>
              ))}
            </div>
            <label className={styles.field}>
              <span className={styles.label}>{t('textInspector.boxColor')}</span>
              <ColorField value={overlay.boxColor} onChange={(boxColor) => update({ boxColor })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('textInspector.opacity')}</span>
              <SliderField
                value={Math.round(overlay.boxOpacity * 100)}
                onChange={(value) => update({ boxOpacity: Math.min(1, Math.max(0, value / 100)) })}
              />
            </label>
            {overlay.bubble === 'rounded' ? (
              <label className={styles.field}>
                <span className={styles.label}>{t('textInspector.boxRadius')}</span>
                <SliderField
                  value={Math.round(overlay.boxRadius * 100)}
                  onChange={(value) => update({ boxRadius: Math.max(0, value / 100) })}
                />
              </label>
            ) : null}
            <label className={styles.field}>
              <span className={styles.label}>{t('textInspector.boxPadding')}</span>
              <SliderField
                max={200}
                value={Math.round(overlay.boxPadding * 100)}
                onChange={(value) => update({ boxPadding: Math.max(0, value / 100) })}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t('textInspector.grpEffect')}</span>
        <div className={styles.effectGrid}>
          {TEXT_EFFECTS.map((eff) => (
            <button
              key={eff}
              type="button"
              className={overlay.effect === eff ? `${styles.effectCell} ${styles.toggleOn}` : styles.effectCell}
              aria-pressed={overlay.effect === eff}
              onClick={() => update({ effect: eff })}
            >
              {t(`effect.${eff}`)}
            </button>
          ))}
        </div>
        {overlay.effect !== 'none' ? (
          <>
            {effectShowsColor ? (
              <label className={styles.field}>
                <span className={styles.label}>{t('textInspector.color')}</span>
                <ColorField value={overlay.effectColor} onChange={(effectColor) => update({ effectColor })} />
              </label>
            ) : null}
            <label className={styles.field}>
              <span className={styles.label}>{t('textInspector.glowStrength')}</span>
              <SliderField
                value={Math.round(overlay.effectIntensity * 100)}
                onChange={(value) => update({ effectIntensity: Math.max(0, value / 100) })}
              />
            </label>
            {effectShowsDirection ? (
              <label className={styles.field}>
                <span className={styles.label}>{t('textInspector.gradAngle')}</span>
                <SliderField
                  min={0}
                  max={360}
                  value={Math.round(overlay.effectDirection)}
                  onChange={(value) => update({ effectDirection: value })}
                />
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t('textInspector.grpAnimation')}</span>
        <label className={styles.field}>
          <span className={styles.label}>{t('textInspector.animIn')}</span>
          <select
            className={styles.select}
            value={overlay.animationIn}
            // options are exactly the TextAnimation union members
            onChange={(event) => update({ animationIn: event.target.value as TextAnimation })}
          >
            {animOptions}
          </select>
          <NumberField
            className={styles.number}
            min={0}
            step={0.1}
            value={overlay.animInDuration}
            onCommit={(value) => update({ animInDuration: Math.max(0, value) })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('textInspector.animOut')}</span>
          <select
            className={styles.select}
            value={overlay.animationOut}
            // options are exactly the TextAnimation union members
            onChange={(event) => update({ animationOut: event.target.value as TextAnimation })}
          >
            {animOptions}
          </select>
          <NumberField
            className={styles.number}
            min={0}
            step={0.1}
            value={overlay.animOutDuration}
            onCommit={(value) => update({ animOutDuration: Math.max(0, value) })}
          />
        </label>
      </div>

      <p className={styles.hint}>{t('textInspector.dragHint')}</p>

      <button
        type="button"
        className={`${styles.toggle} ${styles.toggleActive} ${styles.block}`}
        onClick={() => useTimelineStore.getState().removeTextOverlay(overlay.id)}
      >
        {t('textInspector.remove')}
      </button>
    </div>
  )
}
