import type { PointerEvent as ReactPointerEvent } from 'react'
import { clipTimelineDuration, type Clip, type TrackKind } from '@shared'
import styles from './ClipView.module.css'

interface ClipViewProps {
  clip: Clip
  label: string
  kind: TrackKind
  selected: boolean
  pxPerSec: number
  top: number
  height: number
  onMovePointerDown: (event: ReactPointerEvent) => void
  onTrimPointerDown: (side: 'l' | 'r', event: ReactPointerEvent) => void
}

export function ClipView({
  clip,
  label,
  kind,
  selected,
  pxPerSec,
  top,
  height,
  onMovePointerDown,
  onTrimPointerDown
}: ClipViewProps) {
  const left = clip.startOnTimeline * pxPerSec
  const width = Math.max(2, clipTimelineDuration(clip) * pxPerSec)

  const className = [styles.clip, kind === 'video' ? styles.video : styles.audio, selected ? styles.selected : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      style={{ left, width, top, height }}
      onPointerDown={onMovePointerDown}
    >
      <div
        className={`${styles.handle} ${styles.handleLeft}`}
        onPointerDown={(event) => {
          event.stopPropagation()
          onTrimPointerDown('l', event)
        }}
      />
      <span className={styles.label}>{label}</span>
      <div
        className={`${styles.handle} ${styles.handleRight}`}
        onPointerDown={(event) => {
          event.stopPropagation()
          onTrimPointerDown('r', event)
        }}
      />
    </div>
  )
}
