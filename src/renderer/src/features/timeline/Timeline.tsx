import { useCallback, useEffect, useReducer, useRef, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clipTimelineDuration,
  getTracksSorted,
  timelineDuration,
  type Clip
} from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { TIMELINE_CONFIG } from '../../config/timeline'
import { collectSnapPoints, snapValue } from './geometry'
import { MEDIA_DRAG_TYPE } from './dragTypes'
import { TimelineToolbar } from './TimelineToolbar'
import { TimeRuler } from './TimeRuler'
import { ClipView } from './ClipView'
import styles from './Timeline.module.css'

interface DragState {
  kind: 'move' | 'trim-l' | 'trim-r'
  clipId: string
  original: Clip
  sourceDuration: number
  pointerStartX: number
  patch: { startOnTimeline: number; trackId: string; sourceIn: number; sourceOut: number }
}

const { trackHeight, rulerHeight, snapThresholdPx, minClipDuration } = TIMELINE_CONFIG

export function Timeline() {
  const { t } = useTranslation()
  const model = useTimelineStore((state) => state.model)
  const pxPerSec = useTimelineStore((state) => state.pxPerSec)
  const selectedClipId = useTimelineStore((state) => state.selectedClipId)
  const playheadTime = useTimelineStore((state) => state.playheadTime)
  const mediaItems = useMediaStore((state) => state.items)

  const tracksRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0)

  const sortedTracks = getTracksSorted(model)
  const trackIndex = (trackId: string): number => sortedTracks.findIndex((track) => track.id === trackId)
  const mediaById = (mediaId: string) => mediaItems.find((item) => item.id === mediaId)

  const contentDuration = Math.max(timelineDuration(model), 20) + 10
  const width = contentDuration * pxPerSec
  const tracksHeight = sortedTracks.length * trackHeight

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const state = useTimelineStore.getState()
    const ps = state.pxPerSec
    const points = collectSnapPoints(state.model, drag.clipId, state.playheadTime)
    const threshold = snapThresholdPx / ps
    const speed = drag.original.speed > 0 ? drag.original.speed : 1
    const deltaSeconds = (event.clientX - drag.pointerStartX) / ps

    if (drag.kind === 'move') {
      const duration = clipTimelineDuration(drag.original)
      let start = Math.max(0, drag.original.startOnTimeline + deltaSeconds)
      const snappedStart = snapValue(start, points, threshold)
      const snappedEnd = snapValue(start + duration, points, threshold) - duration
      start = Math.abs(snappedStart - start) <= Math.abs(snappedEnd - start) ? snappedStart : snappedEnd
      start = Math.max(0, start)

      const rect = tracksRef.current?.getBoundingClientRect()
      let trackId = drag.original.trackId
      if (rect) {
        const tracks = getTracksSorted(state.model)
        const index = Math.min(Math.max(Math.floor((event.clientY - rect.top) / trackHeight), 0), tracks.length - 1)
        const target = tracks[index]
        const origin = tracks.find((track) => track.id === drag.original.trackId)
        if (target && origin && target.kind === origin.kind) trackId = target.id
      }
      drag.patch = { ...drag.patch, startOnTimeline: start, trackId }
    } else if (drag.kind === 'trim-l') {
      const minSource = minClipDuration * speed
      let start = Math.max(0, drag.original.startOnTimeline + deltaSeconds)
      start = Math.max(0, snapValue(start, points, threshold))
      let sourceIn = drag.original.sourceIn + (start - drag.original.startOnTimeline) * speed
      sourceIn = Math.min(Math.max(sourceIn, 0), drag.original.sourceOut - minSource)
      start = drag.original.startOnTimeline + (sourceIn - drag.original.sourceIn) / speed
      drag.patch = { ...drag.patch, startOnTimeline: start, sourceIn, sourceOut: drag.original.sourceOut }
    } else {
      const minSource = minClipDuration * speed
      const duration = clipTimelineDuration(drag.original)
      const end = snapValue(drag.original.startOnTimeline + duration + deltaSeconds, points, threshold)
      let sourceOut = drag.original.sourceIn + (end - drag.original.startOnTimeline) * speed
      sourceOut = Math.min(Math.max(sourceOut, drag.original.sourceIn + minSource), drag.sourceDuration)
      drag.patch = { ...drag.patch, sourceOut }
    }
    forceRender()
  }, [])

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    const store = useTimelineStore.getState()
    if (drag.kind === 'move') {
      store.moveClip(drag.clipId, { trackId: drag.patch.trackId, startOnTimeline: drag.patch.startOnTimeline })
    } else {
      store.trimClip(drag.clipId, {
        sourceIn: drag.patch.sourceIn,
        sourceOut: drag.patch.sourceOut,
        startOnTimeline: drag.patch.startOnTimeline
      })
    }
    dragRef.current = null
    forceRender()
  }, [onPointerMove])

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const beginDrag = (kind: DragState['kind'], clip: Clip, event: ReactPointerEvent): void => {
    event.preventDefault()
    useTimelineStore.getState().selectClip(clip.id)
    dragRef.current = {
      kind,
      clipId: clip.id,
      original: clip,
      sourceDuration: mediaById(clip.mediaId)?.durationSeconds ?? clip.sourceOut,
      pointerStartX: event.clientX,
      patch: {
        startOnTimeline: clip.startOnTimeline,
        trackId: clip.trackId,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut
      }
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    const mediaId = event.dataTransfer.getData(MEDIA_DRAG_TYPE)
    const media = mediaById(mediaId)
    const rect = tracksRef.current?.getBoundingClientRect()
    if (!media || !rect) return

    const index = Math.min(Math.max(Math.floor((event.clientY - rect.top) / trackHeight), 0), sortedTracks.length - 1)
    const dropped = sortedTracks[index]
    const target = dropped && dropped.kind === media.kind ? dropped : sortedTracks.find((track) => track.kind === media.kind)
    if (!target) return

    const time = Math.max(0, (event.clientX - rect.left) / pxPerSec)
    const snapped = Math.max(0, snapValue(time, collectSnapPoints(model, null, playheadTime), snapThresholdPx / pxPerSec))
    useTimelineStore.getState().addClipFromMedia(mediaId, target.id, snapped, media.durationSeconds)
  }

  const drag = dragRef.current
  const clips = Object.values(model.clips)
  const isEmpty = clips.length === 0

  return (
    <section className={styles.timeline}>
      <TimelineToolbar />
      <div className={styles.body}>
        <div className={styles.gutter}>
          <div className={styles.gutterSpacer} style={{ height: rulerHeight }} />
          {sortedTracks.map((track) => (
            <div key={track.id} className={styles.trackHeader} style={{ height: trackHeight }}>
              {track.label}
            </div>
          ))}
        </div>

        <div className={styles.scroll}>
          <div className={styles.content} style={{ width }}>
            <TimeRuler pxPerSec={pxPerSec} width={width} onSeek={(time) => useTimelineStore.getState().setPlayhead(time)} />
            <div
              ref={tracksRef}
              className={styles.tracks}
              style={{ height: tracksHeight }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) useTimelineStore.getState().selectClip(null)
              }}
            >
              {sortedTracks.map((track, index) => (
                <div
                  key={track.id}
                  className={`${styles.lane} ${index % 2 === 1 ? styles.laneAlt : ''}`}
                  style={{ top: index * trackHeight, height: trackHeight }}
                />
              ))}

              {clips.map((clip) => {
                const display = drag?.clipId === clip.id ? { ...clip, ...drag.patch } : clip
                const index = trackIndex(display.trackId)
                if (index < 0) return null
                return (
                  <ClipView
                    key={clip.id}
                    clip={display}
                    label={mediaById(clip.mediaId)?.name ?? '—'}
                    kind={sortedTracks[index]?.kind ?? 'video'}
                    selected={clip.id === selectedClipId}
                    pxPerSec={pxPerSec}
                    top={index * trackHeight}
                    height={trackHeight}
                    onMovePointerDown={(event) => beginDrag('move', clip, event)}
                    onTrimPointerDown={(side, event) => beginDrag(side === 'l' ? 'trim-l' : 'trim-r', clip, event)}
                  />
                )
              })}

              {isEmpty ? <div className={styles.empty}>{t('timeline.dropHint')}</div> : null}
            </div>

            <div
              className={styles.playhead}
              style={{ left: playheadTime * pxPerSec, height: rulerHeight + tracksHeight }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
