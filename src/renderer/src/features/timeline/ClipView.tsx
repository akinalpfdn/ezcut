import {
  memo,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { clipTimelineDuration, type Clip, type MediaItem, type TrackKind } from '@shared'
import { Waveform } from '../mediaBin/Waveform'
import { useFilmstripStore } from '../../stores/filmstripStore'
import { toMediaUrl } from '../../utils/mediaUrl'
import styles from './ClipView.module.css'

/**
 * Filmstrip for a video clip: one cached sprite covers the whole source, so we
 * scale it so the clip's [sourceIn, sourceOut] slice fills the clip width and
 * offset it to the slice start. Subscribes to the store independently so a clip
 * only repaints when its strip becomes ready, not the whole timeline.
 */
function ClipFilmstrip({ media, clip, width }: { media: MediaItem; clip: Clip; width: number }) {
  const path = useFilmstripStore((state) => {
    const entry = state.strips[media.path]
    return entry?.status === 'ready' ? (entry.path ?? null) : null
  })

  useEffect(() => {
    useFilmstripStore.getState().ensure(media.path, media.durationSeconds)
  }, [media.path, media.durationSeconds])

  if (!path || media.durationSeconds <= 0) return null
  const slice = Math.max(0.0001, clip.sourceOut - clip.sourceIn)
  const stripWidth = (media.durationSeconds / slice) * width
  const offset = -(clip.sourceIn / media.durationSeconds) * stripWidth

  return (
    <div
      className={styles.filmstrip}
      style={{
        backgroundImage: `url(${toMediaUrl(path)})`,
        backgroundSize: `${stripWidth}px 100%`,
        backgroundPositionX: `${offset}px`
      }}
    />
  )
}

interface ClipViewProps {
  clip: Clip
  label: string
  kind: TrackKind
  media: MediaItem | undefined
  selected: boolean
  pxPerSec: number
  top: number
  height: number
  onMovePointerDown: (event: ReactPointerEvent) => void
  onTrimPointerDown: (side: 'l' | 'r', event: ReactPointerEvent) => void
  onContextMenu: (event: ReactMouseEvent) => void
}

/** Peaks for the clip's [sourceIn, sourceOut] slice of the source waveform. */
function slicePeaks(media: MediaItem | undefined, clip: Clip): number[] | null {
  const peaks = media?.waveform?.peaks
  if (!peaks || !media || media.durationSeconds <= 0) return null
  const start = Math.floor((clip.sourceIn / media.durationSeconds) * peaks.length)
  const end = Math.ceil((clip.sourceOut / media.durationSeconds) * peaks.length)
  const slice = peaks.slice(Math.max(0, start), Math.min(peaks.length, end))
  return slice.length > 0 ? slice : null
}

function ClipViewImpl({
  clip,
  label,
  kind,
  media,
  selected,
  pxPerSec,
  top,
  height,
  onMovePointerDown,
  onTrimPointerDown,
  onContextMenu
}: ClipViewProps) {
  const left = clip.startOnTimeline * pxPerSec
  const width = Math.max(2, clipTimelineDuration(clip) * pxPerSec)
  const peaks = useMemo(
    () => slicePeaks(media, clip),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, clip.sourceIn, clip.sourceOut]
  )

  const className = [styles.clip, kind === 'video' ? styles.video : styles.audio, selected ? styles.selected : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      style={{ left, width, top, height }}
      onPointerDown={onMovePointerDown}
      onContextMenu={onContextMenu}
    >
      {kind === 'video' && media ? <ClipFilmstrip media={media} clip={clip} width={width} /> : null}
      {peaks ? <Waveform peaks={peaks} className={styles.waveform} /> : null}
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
      {clip.transitionOut ? <div className={styles.transition} /> : null}
    </div>
  )
}

/**
 * Memoized so a pointermove on one clip (which re-renders the whole Timeline)
 * doesn't reconcile every other ClipView. Compares only the data props — the
 * handler props are new closures each render but behave identically for an
 * unchanged clip, so they're intentionally ignored.
 */
export const ClipView = memo(
  ClipViewImpl,
  (prev, next) =>
    prev.clip === next.clip &&
    prev.label === next.label &&
    prev.media === next.media &&
    prev.kind === next.kind &&
    prev.selected === next.selected &&
    prev.pxPerSec === next.pxPerSec &&
    prev.top === next.top &&
    prev.height === next.height
)
