import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@shared'
import { Waveform } from './Waveform'
import { toMediaUrl } from '../../utils/mediaUrl'
import { formatDuration } from '../../utils/format'
import { MEDIA_DRAG_TYPE } from '../timeline/dragTypes'
import styles from './MediaCard.module.css'

interface MediaCardProps {
  item: MediaItem
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void
}

export function MediaCard({ item, selected, onSelect, onRemove, onContextMenu }: MediaCardProps) {
  const { t } = useTranslation()

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  function handleRemove(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onRemove()
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className={selected ? `${styles.card} ${styles.selected}` : styles.card}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      draggable
      onDragStart={handleDragStart}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
    >
      <div className={styles.thumb}>
        {item.thumbnailPath ? (
          <img className={styles.image} src={toMediaUrl(item.thumbnailPath)} alt="" />
        ) : item.waveform ? (
          <Waveform peaks={item.waveform.peaks} />
        ) : (
          <div className={styles.placeholder} />
        )}
        <span className={styles.kind}>{t(`media.kind.${item.kind}`)}</span>
        <span className={styles.duration}>{formatDuration(item.durationSeconds)}</span>
      </div>
      <div className={styles.meta}>
        <span className={styles.name} title={item.name}>
          {item.name}
        </span>
        <button
          type="button"
          className={styles.remove}
          title={t('media.remove')}
          aria-label={t('media.remove')}
          onClick={handleRemove}
        >
          ×
        </button>
      </div>
    </div>
  )
}
