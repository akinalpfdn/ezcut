import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { splitSelected } from './editorActions'
import styles from './TimelineToolbar.module.css'

export function TimelineToolbar() {
  const { t } = useTranslation()
  const selectedClipId = useTimelineStore((state) => state.selectedClipId)
  const canUndo = useTimelineStore((state) => state.undoStack.length > 0)
  const canRedo = useTimelineStore((state) => state.redoStack.length > 0)
  const selectedMediaId = useTimelineStore((state) =>
    state.selectedClipId ? (state.model.clips[state.selectedClipId]?.mediaId ?? null) : null
  )
  const selectedName = useMediaStore(
    (state) => state.items.find((item) => item.id === selectedMediaId)?.name ?? null
  )

  const hasClips = useTimelineStore((state) => Object.keys(state.model.clips).length > 0)
  const pinPlayhead = useTimelineStore((state) => state.pinPlayhead)

  const store = useTimelineStore
  const hasSelection = selectedClipId !== null

  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        className={styles.button}
        onClick={() => store.getState().addAudioTrack()}
      >
        {t('timeline.addAudioTrack')}
      </button>

      <span className={styles.divider} />

      <button
        type="button"
        className={styles.button}
        disabled={!hasSelection}
        onClick={() => splitSelected()}
      >
        {t('timeline.split')}
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={!hasSelection}
        onClick={() => {
          const state = store.getState()
          if (state.selectedClipId) state.mergeWithNext(state.selectedClipId)
        }}
      >
        {t('timeline.merge')}
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={!hasSelection}
        onClick={() => {
          const state = store.getState()
          if (state.selectedClipId) state.deleteClip(state.selectedClipId)
        }}
      >
        {t('timeline.delete')}
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={!hasClips}
        title={t('timeline.closeGapsHint')}
        onClick={() => store.getState().closeGaps()}
      >
        {t('timeline.closeGaps')}
      </button>

      <span className={styles.divider} />

      <button
        type="button"
        className={styles.button}
        disabled={!canUndo}
        onClick={() => store.getState().undo()}
      >
        {t('timeline.undo')}
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={!canRedo}
        onClick={() => store.getState().redo()}
      >
        {t('timeline.redo')}
      </button>

      <div className={styles.spacer} />

      {selectedName ? (
        <span className={styles.selection}>
          {t('timeline.selected')}: <strong>{selectedName}</strong>
        </span>
      ) : null}

      <span className={styles.divider} />

      <button
        type="button"
        className={pinPlayhead ? `${styles.button} ${styles.active}` : styles.button}
        title={t('timeline.pinHint')}
        aria-pressed={pinPlayhead}
        onClick={() => store.getState().togglePinPlayhead()}
      >
        {t('timeline.pin')}
      </button>

      <button type="button" className={styles.iconButton} onClick={() => store.getState().zoomOut()}>
        −
      </button>
      <button type="button" className={styles.iconButton} onClick={() => store.getState().zoomIn()}>
        +
      </button>
    </div>
  )
}
