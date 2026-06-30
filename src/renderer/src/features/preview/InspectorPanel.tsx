import { useTranslation } from 'react-i18next'
import { ASPECT_RATIOS, type AspectRatio } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { ClipInspector } from './ClipInspector'
import { TextInspector } from './TextInspector'
import styles from './InspectorPanel.module.css'

const FORMAT_HINT: Record<AspectRatio, string> = {
  '16:9': 'YouTube',
  '9:16': 'Reels',
  '1:1': 'Square',
  '4:5': 'Portrait'
}

/** Right-side properties panel. A project format selector on top, then the text or
 * clip inspector for the current selection (or a hint when nothing is selected). */
export function InspectorPanel() {
  const { t } = useTranslation()
  const aspectRatio = useTimelineStore((state) => state.model.aspectRatio)
  const hasOverlay = useTimelineStore((state) => state.selectedOverlayId !== null)
  const hasClip = useTimelineStore((state) => state.selectedClipId !== null)

  return (
    <aside className={styles.panel}>
      <div className={styles.formatBar}>
        <span className={styles.formatLabel}>{t('format.label')}</span>
        <select
          className={styles.formatSelect}
          value={aspectRatio}
          onChange={(event) => useTimelineStore.getState().setAspectRatio(event.target.value as AspectRatio)}
        >
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio} · {FORMAT_HINT[ratio]}
            </option>
          ))}
        </select>
      </div>

      {hasOverlay || hasClip ? (
        <>
          <TextInspector />
          <ClipInspector />
        </>
      ) : (
        <div className={styles.empty}>{t('inspector.empty')}</div>
      )}
    </aside>
  )
}
