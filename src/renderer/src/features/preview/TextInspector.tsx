import { useTranslation } from 'react-i18next'
import { FONT_FAMILIES, type FontFamily, type TextOverlay } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { NumberField } from '../../components/NumberField'
import styles from './ClipInspector.module.css'

/** Inspector shown when a text overlay is selected (mutually exclusive with the
 * clip inspector). Edits content + basic style; rendering happens in the compositor. */
export function TextInspector() {
  const { t } = useTranslation()
  const overlay = useTimelineStore((state) =>
    state.selectedOverlayId
      ? (state.model.textOverlays.find((candidate) => candidate.id === state.selectedOverlayId) ?? null)
      : null
  )

  if (!overlay) return null

  const update = (patch: Partial<TextOverlay>): void => useTimelineStore.getState().updateTextOverlay(overlay.id, patch)

  return (
    <div className={styles.inspector}>
      <input
        className={styles.textInput}
        type="text"
        value={overlay.text}
        placeholder={t('textInspector.placeholder')}
        onChange={(event) => update({ text: event.target.value })}
      />

      <label className={styles.field}>
        <span className={styles.label}>{t('textInspector.font')}</span>
        <select
          className={styles.select}
          value={overlay.fontFamily}
          onChange={(event) => update({ fontFamily: event.target.value as FontFamily })}
        >
          {FONT_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {t(`fontFamily.${family}`)}
            </option>
          ))}
        </select>
      </label>

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

      <button
        type="button"
        className={overlay.background ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
        aria-pressed={overlay.background}
        onClick={() => update({ background: !overlay.background })}
      >
        {t('textInspector.box')}
      </button>

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
