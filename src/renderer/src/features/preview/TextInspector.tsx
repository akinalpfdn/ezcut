import { useTranslation } from 'react-i18next'
import { FONT_FAMILIES, TEXT_ALIGNS, TEXT_ANIMATIONS, type TextAnimation, type TextOverlay } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { NumberField } from '../../components/NumberField'
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

  return (
    <div className={styles.inspector}>
      <textarea
        className={styles.textArea}
        rows={2}
        value={overlay.text}
        placeholder={t('textInspector.placeholder')}
        onChange={(event) => update({ text: event.target.value })}
      />

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
        <span className={styles.label}>{t('textInspector.color')}</span>
        <input type="color" value={overlay.color} onChange={(event) => update({ color: event.target.value })} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('textInspector.opacity')}</span>
        <NumberField
          className={styles.number}
          min={0}
          max={100}
          step={5}
          value={Math.round(overlay.opacity * 100)}
          onCommit={(value) => update({ opacity: Math.min(1, Math.max(0, value / 100)) })}
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
        <span className={styles.label}>{t('textInspector.outline')}</span>
        <input
          type="color"
          value={overlay.outlineColor}
          onChange={(event) => update({ outlineColor: event.target.value })}
        />
        <NumberField
          className={styles.number}
          min={0}
          max={50}
          step={1}
          value={Math.round(overlay.outlineWidth * 100)}
          onCommit={(value) => update({ outlineWidth: Math.max(0, value / 100) })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('textInspector.rotation')}</span>
        <NumberField
          className={styles.number}
          min={-180}
          max={180}
          step={1}
          value={Math.round(overlay.rotation)}
          onCommit={(value) => update({ rotation: value })}
        />
      </label>

      <button
        type="button"
        className={overlay.background ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
        aria-pressed={overlay.background}
        onClick={() => update({ background: !overlay.background })}
      >
        {t('textInspector.box')}
      </button>

      {overlay.background ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>{t('textInspector.boxColor')}</span>
            <input
              type="color"
              value={overlay.boxColor}
              onChange={(event) => update({ boxColor: event.target.value })}
            />
            <NumberField
              className={styles.number}
              min={0}
              max={100}
              step={5}
              value={Math.round(overlay.boxOpacity * 100)}
              onCommit={(value) => update({ boxOpacity: Math.min(1, Math.max(0, value / 100)) })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('textInspector.boxRadius')}</span>
            <NumberField
              className={styles.number}
              min={0}
              max={100}
              step={5}
              value={Math.round(overlay.boxRadius * 100)}
              onCommit={(value) => update({ boxRadius: Math.max(0, value / 100) })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('textInspector.boxPadding')}</span>
            <NumberField
              className={styles.number}
              min={0}
              max={200}
              step={5}
              value={Math.round(overlay.boxPadding * 100)}
              onCommit={(value) => update({ boxPadding: Math.max(0, value / 100) })}
            />
          </label>
        </>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>{t('textInspector.animIn')}</span>
        <select
          className={styles.select}
          value={overlay.animationIn}
          // options are exactly the TextAnimation union members
          onChange={(event) => update({ animationIn: event.target.value as TextAnimation })}
        >
          {TEXT_ANIMATIONS.map((anim) => (
            <option key={anim} value={anim}>
              {t(`anim.${anim}`)}
            </option>
          ))}
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
          {TEXT_ANIMATIONS.map((anim) => (
            <option key={anim} value={anim}>
              {t(`anim.${anim}`)}
            </option>
          ))}
        </select>
        <NumberField
          className={styles.number}
          min={0}
          step={0.1}
          value={overlay.animOutDuration}
          onCommit={(value) => update({ animOutDuration: Math.max(0, value) })}
        />
      </label>

      <p className={styles.hint}>{t('textInspector.dragHint')}</p>

      <button
        type="button"
        className={`${styles.toggle} ${styles.toggleActive}`}
        onClick={() => useTimelineStore.getState().removeTextOverlay(overlay.id)}
      >
        {t('textInspector.remove')}
      </button>
    </div>
  )
}
