import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  clipTimelineDuration,
  getTracksSorted,
  nextClipStart,
  previousClipEnd,
  resolveNonOverlappingStart,
  timelineDuration,
  type Clip,
  type MediaItem
} from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useTransportStore } from '../../stores/transportStore'
import { useMediaStore } from '../../stores/mediaStore'
import { useKeymapStore } from '../../stores/keymapStore'
import { TIMELINE_CONFIG } from '../../config/timeline'
import { collectSnapPoints, snapValue } from './geometry'
import { MEDIA_DRAG_TYPE } from './dragTypes'
import { deleteSelected, mergeSelected, splitSelected, toggleClipDenoise } from './editorActions'
import { formatCombo } from '../shortcuts/keyCombo'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu/ContextMenu'
import { TimelineToolbar } from './TimelineToolbar'
import { TimeRuler } from './TimeRuler'
import { ClipView } from './ClipView'
import { Playhead } from './Playhead'
import styles from './Timeline.module.css'

interface MenuState {
  type: 'clip' | 'track'
  id: string
  x: number
  y: number
}

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
  const isPlaying = useTransportStore((state) => state.isPlaying)
  const pinPlayhead = useTimelineStore((state) => state.pinPlayhead)
  const mediaItems = useMediaStore((state) => state.items)
  const keymap = useKeymapStore((state) => state.keymap)

  const tracksRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const moveRafRef = useRef<number | null>(null)
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0)
  const [menu, setMenu] = useState<MenuState | null>(null)

  // Coalesce drag re-renders to one per animation frame — pointermove can fire
  // far more often than the display refreshes.
  const scheduleDragRender = useCallback(() => {
    if (moveRafRef.current !== null) return
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = null
      forceRender()
    })
  }, [])

  // Ctrl+wheel zooms, Alt+wheel pans horizontally. A native non-passive listener
  // is required so preventDefault can override the browser's ctrl+wheel page zoom.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      const store = useTimelineStore.getState()
      if (event.ctrlKey) {
        event.preventDefault()
        const oldPx = store.pxPerSec
        const factor = event.deltaY < 0 ? TIMELINE_CONFIG.zoomFactor : 1 / TIMELINE_CONFIG.zoomFactor
        // Keep the timeline time under the cursor fixed (zoom toward the mouse).
        const rect = element.getBoundingClientRect()
        const pointerOffset = event.clientX - rect.left
        const timeAtMouse = (element.scrollLeft + pointerOffset) / oldPx
        store.setPxPerSec(oldPx * factor)
        requestAnimationFrame(() => {
          const newPx = useTimelineStore.getState().pxPerSec
          element.scrollLeft = timeAtMouse * newPx - pointerOffset
        })
      } else if (event.altKey) {
        event.preventDefault()
        element.scrollLeft += event.deltaY
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  // Pinned playhead: keep it in view during playback by centering it whenever it
  // scrolls out of the viewport. A dedicated rAF that runs ONLY while pinned and
  // playing (instead of a subscription firing on every store change), so the one
  // layout read/write per frame is frame-aligned and confined to that case.
  // Suppressed during a drag so manual edits aren't yanked around.
  useEffect(() => {
    if (!pinPlayhead || !isPlaying) return
    const element = scrollRef.current
    if (!element) return
    let rafId = requestAnimationFrame(function follow() {
      if (!dragRef.current) {
        const playheadTime = useTransportStore.getState().playheadTime
        const ps = useTimelineStore.getState().pxPerSec
        const playheadPx = playheadTime * ps
        const left = element.scrollLeft
        if (playheadPx < left || playheadPx > left + element.clientWidth) {
          element.scrollLeft = playheadPx - element.clientWidth / 2
        }
      }
      rafId = requestAnimationFrame(follow)
    })
    return () => cancelAnimationFrame(rafId)
  }, [pinPlayhead, isPlaying])

  const sortedTracks = getTracksSorted(model)
  const trackIndex = (trackId: string): number => sortedTracks.findIndex((track) => track.id === trackId)
  const mediaByIdMap = useMemo(
    () => new Map(mediaItems.map((item) => [item.id, item])),
    [mediaItems]
  )
  const mediaById = (mediaId: string): MediaItem | undefined => mediaByIdMap.get(mediaId)

  const contentDuration = Math.max(timelineDuration(model), 20) + 10
  const width = contentDuration * pxPerSec
  const tracksHeight = sortedTracks.length * trackHeight

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const state = useTimelineStore.getState()
    const ps = state.pxPerSec
    const points = collectSnapPoints(state.model, drag.clipId, useTransportStore.getState().playheadTime)
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
      start = resolveNonOverlappingStart(state.model, trackId, start, duration, drag.clipId)
      drag.patch = { ...drag.patch, startOnTimeline: start, trackId }
    } else if (drag.kind === 'trim-l') {
      const minSource = minClipDuration * speed
      let start = Math.max(0, drag.original.startOnTimeline + deltaSeconds)
      start = Math.max(0, snapValue(start, points, threshold))
      // Don't trim past the previous clip on this track.
      start = Math.max(start, previousClipEnd(state.model, drag.original.trackId, drag.original.startOnTimeline, drag.clipId))
      let sourceIn = drag.original.sourceIn + (start - drag.original.startOnTimeline) * speed
      sourceIn = Math.min(Math.max(sourceIn, 0), drag.original.sourceOut - minSource)
      start = drag.original.startOnTimeline + (sourceIn - drag.original.sourceIn) / speed
      drag.patch = { ...drag.patch, startOnTimeline: start, sourceIn, sourceOut: drag.original.sourceOut }
    } else {
      const minSource = minClipDuration * speed
      const duration = clipTimelineDuration(drag.original)
      const snappedEnd = snapValue(drag.original.startOnTimeline + duration + deltaSeconds, points, threshold)
      // Don't trim past the next clip on this track.
      const limit = nextClipStart(state.model, drag.original.trackId, drag.original.startOnTimeline, drag.clipId)
      const end = Math.min(snappedEnd, limit)
      let sourceOut = drag.original.sourceIn + (end - drag.original.startOnTimeline) * speed
      sourceOut = Math.min(Math.max(sourceOut, drag.original.sourceIn + minSource), drag.sourceDuration)
      drag.patch = { ...drag.patch, sourceOut }
    }
    scheduleDragRender()
  }, [scheduleDragRender])

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current)
      moveRafRef.current = null
    }
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
      if (moveRafRef.current !== null) cancelAnimationFrame(moveRafRef.current)
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
    const playhead = useTransportStore.getState().playheadTime
    const snapped = Math.max(0, snapValue(time, collectSnapPoints(model, null, playhead), snapThresholdPx / pxPerSec))
    useTimelineStore.getState().addClipFromMedia(mediaId, target.id, snapped, media.durationSeconds)
  }

  function openClipMenu(clipId: string, event: ReactMouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    useTimelineStore.getState().selectClip(clipId)
    setMenu({ type: 'clip', id: clipId, x: event.clientX, y: event.clientY })
  }

  function openTrackMenu(event: ReactMouseEvent): void {
    event.preventDefault()
    const rect = tracksRef.current?.getBoundingClientRect()
    if (!rect) return
    const index = Math.min(Math.max(Math.floor((event.clientY - rect.top) / trackHeight), 0), sortedTracks.length - 1)
    const track = sortedTracks[index]
    if (track) setMenu({ type: 'track', id: track.id, x: event.clientX, y: event.clientY })
  }

  const clipMenuId = menu?.type === 'clip' ? menu.id : null
  const menuClip = clipMenuId ? (model.clips[clipMenuId] ?? null) : null

  const menuItems: ContextMenuItem[] =
    clipMenuId
      ? [
          { label: t('timeline.split'), hint: formatCombo(keymap.split), onSelect: splitSelected },
          { label: t('timeline.merge'), onSelect: mergeSelected },
          {
            label: menuClip?.denoise.enabled ? t('inspector.denoiseOff') : t('inspector.denoise'),
            onSelect: () => toggleClipDenoise(clipMenuId)
          },
          { label: t('timeline.delete'), hint: formatCombo(keymap.delete), onSelect: deleteSelected }
        ]
      : [{ label: t('timeline.addAudioTrack'), onSelect: () => useTimelineStore.getState().addAudioTrack() }]

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

        <div ref={scrollRef} className={styles.scroll}>
          <div className={styles.content} style={{ width }}>
            <TimeRuler pxPerSec={pxPerSec} width={width} onSeek={(time) => useTransportStore.getState().setPlayhead(time)} />
            <div
              ref={tracksRef}
              className={styles.tracks}
              style={{ height: tracksHeight }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onContextMenu={openTrackMenu}
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
                    media={mediaById(clip.mediaId)}
                    kind={sortedTracks[index]?.kind ?? 'video'}
                    selected={clip.id === selectedClipId}
                    pxPerSec={pxPerSec}
                    top={index * trackHeight}
                    height={trackHeight}
                    onMovePointerDown={(event) => beginDrag('move', clip, event)}
                    onTrimPointerDown={(side, event) => beginDrag(side === 'l' ? 'trim-l' : 'trim-r', clip, event)}
                    onContextMenu={(event) => openClipMenu(clip.id, event)}
                  />
                )
              })}

              {isEmpty ? <div className={styles.empty}>{t('timeline.dropHint')}</div> : null}
            </div>

            <Playhead height={rulerHeight + tracksHeight} />
          </div>
        </div>
      </div>

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      ) : null}
    </section>
  )
}
