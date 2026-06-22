import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@shared'
import { Waveform } from './Waveform'
import { useProxyStore } from '../../stores/proxyStore'
import { toMediaUrl } from '../../utils/mediaUrl'
import { previewNeedsProxy } from '../../utils/proxyPolicy'
import { formatDuration } from '../../utils/format'
import { MEDIA_DRAG_TYPE } from '../timeline/dragTypes'
import styles from './MediaCard.module.css'

const RING_RADIUS = 16
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface MediaCardProps {
  item: MediaItem
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void
}

export function MediaCard({ item, selected, onSelect, onRemove, onContextMenu }: MediaCardProps) {
  const { t } = useTranslation()
  const proxy = useProxyStore((state) => state.proxies[item.path])

  // Media that needs a proxy isn't preview-ready (and can't be dropped on the
  // timeline) until its transcode finishes.
  const preparing = previewNeedsProxy(item) && proxy?.status !== 'ready'
  const failed = proxy?.status === 'error'
  const ready = !preparing
  const progress = proxy?.progress ?? 0

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
    if (!ready) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className={selected ? `${styles.card} ${styles.selected}` : styles.card}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      draggable={ready}
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
        {preparing ? (
          <div className={styles.preparing} title={t('media.preparing')}>
            <div className={styles.ringWrap}>
              <svg className={styles.ring} viewBox="0 0 40 40">
                <circle className={styles.ringTrack} cx="20" cy="20" r={RING_RADIUS} />
                <circle
                  className={styles.ringFill}
                  cx="20"
                  cy="20"
                  r={RING_RADIUS}
                  style={{
                    strokeDasharray: RING_CIRCUMFERENCE,
                    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress)
                  }}
                />
              </svg>
              <span className={styles.ringText}>{failed ? '!' : `${Math.round(progress * 100)}%`}</span>
            </div>
          </div>
        ) : null}
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
