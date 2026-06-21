import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@shared'
import { useMediaStore } from '../../stores/mediaStore'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaImport } from '../../hooks/useMediaImport'
import { useWaveformBackfill } from './useWaveformBackfill'
import { useRecorder } from '../recording/useRecorder'
import { mediaService } from '../../services/mediaService'
import { Button } from '../../components/Button/Button'
import { ErrorNotice } from '../../components/ErrorNotice'
import { ContextMenu } from '../../components/ContextMenu/ContextMenu'
import { formatDuration } from '../../utils/format'
import { MediaCard } from './MediaCard'
import styles from './MediaBin.module.css'

interface MediaMenuState {
  item: MediaItem
  x: number
  y: number
}

function addToTimeline(item: MediaItem): void {
  const timeline = useTimelineStore.getState()
  const track = timeline.model.tracks.find((candidate) => candidate.kind === item.kind)
  if (track) timeline.addClipFromMedia(item.id, track.id, timeline.playheadTime, item.durationSeconds)
}

export function MediaBin() {
  const { t } = useTranslation()
  const items = useMediaStore((state) => state.items)
  const selectedId = useMediaStore((state) => state.selectedId)
  const select = useMediaStore((state) => state.select)
  const removeItem = useMediaStore((state) => state.removeItem)
  const { importing, errors, importViaDialog, importPaths } = useMediaImport()
  const recorder = useRecorder()
  useWaveformBackfill()
  const [dragOver, setDragOver] = useState(false)
  const [menu, setMenu] = useState<MediaMenuState | null>(null)

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(false)
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => mediaService.getPathForFile(file))
      .filter((path) => path.length > 0)
    void importPaths(paths)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(true)
  }

  return (
    <section
      className={styles.bin}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{t('media.binTitle')}</h2>
        <div className={styles.headerActions}>
          <Button
            variant="ghost"
            className={recorder.recording ? styles.recording : undefined}
            disabled={recorder.saving}
            onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
          >
            {recorder.recording
              ? `● ${formatDuration(recorder.elapsedMs / 1000)}`
              : recorder.saving
                ? t('media.saving')
                : t('media.record')}
          </Button>
          <Button onClick={() => void importViaDialog()} disabled={importing}>
            {importing ? t('media.importing') : t('media.import')}
          </Button>
        </div>
      </header>

      {errors.length > 0 || recorder.error ? (
        <div className={styles.errors}>
          {errors.map((error, index) => (
            <ErrorNotice key={`${error.code}-${index}`} error={error} />
          ))}
          {recorder.error ? <ErrorNotice error={recorder.error} /> : null}
        </div>
      ) : null}

      <div className={dragOver ? `${styles.body} ${styles.dragOver}` : styles.body}>
        {items.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('media.emptyTitle')}</p>
            <p className={styles.emptyHint}>{t('media.emptyHint')}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => select(item.id)}
                onRemove={() => removeItem(item.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ item, x: event.clientX, y: event.clientY })
                }}
              />
            ))}
          </div>
        )}
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t('media.addToTimeline'), onSelect: () => addToTimeline(menu.item) },
            { label: t('media.remove'), onSelect: () => removeItem(menu.item.id) }
          ]}
        />
      ) : null}
    </section>
  )
}
