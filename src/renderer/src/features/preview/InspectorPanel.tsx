import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { ClipInspector } from './ClipInspector'
import { TextInspector } from './TextInspector'
import styles from './InspectorPanel.module.css'

/** Right-side properties panel. Shows the text or clip inspector for the current
 * selection (mutually exclusive), or a hint when nothing is selected. */
export function InspectorPanel() {
  const { t } = useTranslation()
  const hasOverlay = useTimelineStore((state) => state.selectedOverlayId !== null)
  const hasClip = useTimelineStore((state) => state.selectedClipId !== null)

  return (
    <aside className={styles.panel}>
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
