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
  clipTimelineEnd,
  getClipTransition,
  getTrackClips,
  getTracksSorted,
  IMAGE_MAX_DURATION,
  nextClipStart,
  previousClipEnd,
  resolveNonOverlappingStart,
  timelineDuration,
  trackKindForMedia,
  type Clip,
  type MediaItem,
  type TextOverlay
} from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useTransportStore } from '../../stores/transportStore'
import { useMediaStore } from '../../stores/mediaStore'
import { useKeymapStore } from '../../stores/keymapStore'
import { useMediaImportStore } from '../../stores/mediaImportStore'
import { mediaService } from '../../services/mediaService'
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
  type: 'clip' | 'track' | 'transition'
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
  pointerStartY: number
  /** True once the pointer has moved past the drag threshold — distinguishes a real
   * drag from a click, so a click on an (overlapping) transitioned clip doesn't get
   * re-resolved and jumped on pointerup. */
  moved: boolean
  /** Transitions to dissolve on the first real move (so editing a transitioned clip
   * doesn't fight the sanctioned overlap) — the clip's own outgoing one and/or the
   * incoming one from the previous clip. Emptied once dissolved. */
  dissolveClipIds: string[]
}

interface OverlayDragState {
  kind: 'move' | 'trim-l' | 'trim-r'
  id: string
  original: TextOverlay
  pointerStartX: number
  moved: boolean
  patch: { start: number; duration: number }
}

/** Pointer travel (px) before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4

const { trackHeight, rulerHeight, snapThresholdPx, minClipDuration } = TIMELINE_CONFIG

export function Timeline() {
  const { t } = useTranslation()
  const model = useTimelineStore((state) => state.model)
  const pxPerSec = useTimelineStore((state) => state.pxPerSec)
  const selectedClipId = useTimelineStore((state) => state.selectedClipId)
  const selectedOverlayId = useTimelineStore((state) => state.selectedOverlayId)
  const isPlaying = useTransportStore((state) => state.isPlaying)
  const pinPlayhead = useTimelineStore((state) => state.pinPlayhead)
  const mediaItems = useMediaStore((state) => state.items)
  const keymap = useKeymapStore((state) => state.keymap)

  const tracksRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const overlayDragRef = useRef<OverlayDragState | null>(null)
  const moveRafRef = useRef<number | null>(null)
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [fileDragOver, setFileDragOver] = useState(false)

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
  // One extra row below the tracks holds the text overlays.
  const textRowTop = sortedTracks.length * trackHeight
  const tracksHeight = textRowTop + trackHeight

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    // Ignore sub-threshold jitter so a click stays a click. On the first real move,
    // dissolve any transition this clip is in (restoring the overlap) and re-baseline,
    // so the drag continues smoothly from the clip's restored position.
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.pointerStartX, event.clientY - drag.pointerStartY) < DRAG_THRESHOLD_PX) {
        return
      }
      drag.moved = true
      if (drag.dissolveClipIds.length > 0) {
        const ids = drag.dissolveClipIds
        drag.dissolveClipIds = []
        for (const id of ids) useTimelineStore.getState().removeTransition(id)
        const fresh = useTimelineStore.getState().model.clips[drag.clipId]
        if (fresh) {
          drag.original = fresh
          drag.patch = {
            startOnTimeline: fresh.startOnTimeline,
            trackId: fresh.trackId,
            sourceIn: fresh.sourceIn,
            sourceOut: fresh.sourceOut
          }
          drag.pointerStartX = event.clientX
          drag.pointerStartY = event.clientY
        }
      }
    }
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
    // Only commit when the pointer actually dragged — a plain click just selects
    // (and must never re-resolve a transitioned clip's overlap into a jump).
    if (drag.moved) {
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
    const store = useTimelineStore.getState()
    store.selectClip(clip.id)
    const media = mediaById(clip.mediaId)
    // Images have no fixed source length, so they can be stretched up to a cap.
    const sourceDuration = media?.kind === 'image' ? IMAGE_MAX_DURATION : (media?.durationSeconds ?? clip.sourceOut)
    // If the clip is part of a transition (its own outgoing one, or it's the
    // incoming side of the previous clip's), dissolve that transition on the first
    // move — the sanctioned overlap otherwise reads as a collision and the clip jumps.
    const incomingFrom = getTrackClips(store.model, clip.trackId).find(
      (candidate) => getClipTransition(store.model, candidate)?.next.id === clip.id
    )
    const dissolveClipIds: string[] = []
    if (clip.transitionOut) dissolveClipIds.push(clip.id)
    if (incomingFrom) dissolveClipIds.push(incomingFrom.id)
    dragRef.current = {
      kind,
      clipId: clip.id,
      original: clip,
      sourceDuration,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      moved: false,
      patch: {
        startOnTimeline: clip.startOnTimeline,
        trackId: clip.trackId,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut
      },
      dissolveClipIds
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const onOverlayPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = overlayDragRef.current
      if (!drag) return
      if (!drag.moved) {
        if (Math.abs(event.clientX - drag.pointerStartX) < DRAG_THRESHOLD_PX) return
        drag.moved = true
      }
      const state = useTimelineStore.getState()
      const ps = state.pxPerSec
      const points = collectSnapPoints(state.model, null, useTransportStore.getState().playheadTime)
      const threshold = snapThresholdPx / ps
      const delta = (event.clientX - drag.pointerStartX) / ps
      const o = drag.original
      if (drag.kind === 'move') {
        const start = Math.max(0, snapValue(Math.max(0, o.start + delta), points, threshold))
        drag.patch = { start, duration: o.duration }
      } else if (drag.kind === 'trim-l') {
        let start = Math.max(0, snapValue(Math.max(0, o.start + delta), points, threshold))
        start = Math.min(start, o.start + o.duration - minClipDuration)
        drag.patch = { start, duration: o.start + o.duration - start }
      } else {
        const end = snapValue(o.start + o.duration + delta, points, threshold)
        drag.patch = { start: o.start, duration: Math.max(minClipDuration, end - o.start) }
      }
      scheduleDragRender()
    },
    [scheduleDragRender]
  )

  const onOverlayPointerUp = useCallback(() => {
    const drag = overlayDragRef.current
    if (!drag) return
    window.removeEventListener('pointermove', onOverlayPointerMove)
    window.removeEventListener('pointerup', onOverlayPointerUp)
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current)
      moveRafRef.current = null
    }
    if (drag.moved) {
      useTimelineStore.getState().moveTextOverlay(drag.id, drag.patch.start, drag.patch.duration)
    }
    overlayDragRef.current = null
    forceRender()
  }, [onOverlayPointerMove])

  const beginOverlayDrag = (
    kind: OverlayDragState['kind'],
    overlay: TextOverlay,
    event: ReactPointerEvent
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    useTimelineStore.getState().selectOverlay(overlay.id)
    overlayDragRef.current = {
      kind,
      id: overlay.id,
      original: overlay,
      pointerStartX: event.clientX,
      moved: false,
      patch: { start: overlay.start, duration: overlay.duration }
    }
    window.addEventListener('pointermove', onOverlayPointerMove)
    window.addEventListener('pointerup', onOverlayPointerUp)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onOverlayPointerMove)
      window.removeEventListener('pointerup', onOverlayPointerUp)
    }
  }, [onOverlayPointerMove, onOverlayPointerUp])

  // Imports OS-dropped files through the shared pipeline, then places each on a
  // track of its kind at the (snapped) drop time. Runs after the async import, so
  // the drop position is captured before awaiting.
  const placeImportedFiles = useCallback(async (paths: string[], time: number): Promise<void> => {
    const items = await useMediaImportStore.getState().importPaths(paths)
    if (items.length === 0) return
    const store = useTimelineStore.getState()
    const playhead = useTransportStore.getState().playheadTime
    const snapped = Math.max(
      0,
      snapValue(time, collectSnapPoints(store.model, null, playhead), snapThresholdPx / store.pxPerSec)
    )
    for (const item of items) {
      const track = store.model.tracks.find((candidate) => candidate.kind === trackKindForMedia(item.kind))
      if (track) useTimelineStore.getState().addClipFromMedia(item.id, track.id, snapped, item.durationSeconds)
    }
  }, [])

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setFileDragOver(false)
    const rect = tracksRef.current?.getBoundingClientRect()
    if (!rect) return
    const time = Math.max(0, (event.clientX - rect.left) / pxPerSec)

    // OS file drop: import then place. Invalid files surface in the bin's errors.
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) {
      const paths = files.map((file) => mediaService.getPathForFile(file)).filter((path) => path.length > 0)
      void placeImportedFiles(paths, time)
      return
    }

    // Internal drag from the media bin.
    const mediaId = event.dataTransfer.getData(MEDIA_DRAG_TYPE)
    const media = mediaById(mediaId)
    if (!media) return
    const index = Math.min(Math.max(Math.floor((event.clientY - rect.top) / trackHeight), 0), sortedTracks.length - 1)
    const dropped = sortedTracks[index]
    const wantKind = trackKindForMedia(media.kind)
    const target = dropped && dropped.kind === wantKind ? dropped : sortedTracks.find((track) => track.kind === wantKind)
    if (!target) return
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
    menu?.type === 'transition'
      ? [
          {
            label: t('timeline.removeTransition'),
            onSelect: () => useTimelineStore.getState().removeTransition(menu.id)
          }
        ]
      : clipMenuId
      ? [
          { label: t('timeline.split'), hint: formatCombo(keymap.split), onSelect: splitSelected },
          { label: t('timeline.merge'), onSelect: mergeSelected },
          {
            label: menuClip?.denoise.enabled ? t('inspector.denoiseOff') : t('inspector.denoise'),
            onSelect: () => toggleClipDenoise(clipMenuId)
          },
          menuClip?.transitionOut
            ? {
                label: t('timeline.removeTransition'),
                onSelect: () => useTimelineStore.getState().removeTransition(clipMenuId)
              }
            : {
                label: t('timeline.addTransition'),
                onSelect: () =>
                  useTimelineStore.getState().addTransition(clipMenuId, TIMELINE_CONFIG.defaultTransitionDuration)
              },
          { label: t('timeline.delete'), hint: formatCombo(keymap.delete), onSelect: deleteSelected }
        ]
      : [{ label: t('timeline.addAudioTrack'), onSelect: () => useTimelineStore.getState().addAudioTrack() }]

  const drag = dragRef.current
  const clips = Object.values(model.clips)
  const isEmpty = clips.length === 0

  // A fixed-size icon at each transition's junction (the midpoint of the overlap),
  // so it's findable regardless of how short the transition is on a long timeline.
  const transitionMarkers = sortedTracks.flatMap((track, index) =>
    getTrackClips(model, track.id).flatMap((clip) => {
      const transition = getClipTransition(model, clip)
      if (!transition) return []
      const junction = (transition.next.startOnTimeline + clipTimelineEnd(clip)) / 2
      return [{ clipId: clip.id, index, left: junction * pxPerSec }]
    })
  )

  return (
    <section className={styles.timeline}>
      <TimelineToolbar />
      <div className={styles.body}>
        <div className={styles.gutter}>
          <div className={styles.gutterSpacer} style={{ height: rulerHeight }} />
          {sortedTracks.map((track) => (
            <div key={track.id} className={styles.trackHeader} style={{ height: trackHeight }}>
              <span>{track.label}</span>
              <div className={styles.trackButtons}>
                <button
                  type="button"
                  className={track.muted ? `${styles.trackBtn} ${styles.trackBtnMute}` : styles.trackBtn}
                  aria-pressed={track.muted}
                  title={t('timeline.muteTrack')}
                  onClick={() => useTimelineStore.getState().toggleTrackMute(track.id)}
                >
                  M
                </button>
                <button
                  type="button"
                  className={track.solo ? `${styles.trackBtn} ${styles.trackBtnSolo}` : styles.trackBtn}
                  aria-pressed={track.solo}
                  title={t('timeline.soloTrack')}
                  onClick={() => useTimelineStore.getState().toggleTrackSolo(track.id)}
                >
                  S
                </button>
              </div>
            </div>
          ))}
          <div className={styles.trackHeader} style={{ height: trackHeight }}>
            <span>{t('timeline.textRow')}</span>
          </div>
        </div>

        <div ref={scrollRef} className={styles.scroll}>
          <div className={styles.content} style={{ width }}>
            <TimeRuler pxPerSec={pxPerSec} width={width} onSeek={(time) => useTransportStore.getState().setPlayhead(time)} />
            <div
              ref={tracksRef}
              className={fileDragOver ? `${styles.tracks} ${styles.fileDragOver}` : styles.tracks}
              style={{ height: tracksHeight }}
              onDragOver={(event) => {
                event.preventDefault()
                if (event.dataTransfer.types.includes('Files')) setFileDragOver(true)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileDragOver(false)
              }}
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
              <div
                className={`${styles.lane} ${styles.textLane}`}
                style={{ top: textRowTop, height: trackHeight }}
              />

              {model.textOverlays.map((overlay) => {
                const display =
                  overlayDragRef.current?.id === overlay.id
                    ? { ...overlay, ...overlayDragRef.current.patch }
                    : overlay
                return (
                  <div
                    key={overlay.id}
                    className={
                      overlay.id === selectedOverlayId
                        ? `${styles.textBlock} ${styles.textBlockSelected}`
                        : styles.textBlock
                    }
                    style={{
                      left: display.start * pxPerSec,
                      width: Math.max(8, display.duration * pxPerSec),
                      top: textRowTop,
                      height: trackHeight
                    }}
                    onPointerDown={(event) => beginOverlayDrag('move', overlay, event)}
                  >
                    <div
                      className={`${styles.overlayHandle} ${styles.overlayHandleLeft}`}
                      onPointerDown={(event) => beginOverlayDrag('trim-l', overlay, event)}
                    />
                    <span className={styles.textBlockLabel}>{overlay.text || t('timeline.textRow')}</span>
                    <div
                      className={`${styles.overlayHandle} ${styles.overlayHandleRight}`}
                      onPointerDown={(event) => beginOverlayDrag('trim-r', overlay, event)}
                    />
                  </div>
                )
              })}

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

              {transitionMarkers.map((marker) => (
                <div
                  key={`tr-${marker.clipId}`}
                  className={styles.transitionMarker}
                  style={{ left: marker.left, top: marker.index * trackHeight + trackHeight / 2 }}
                  title={t('timeline.transitionHint')}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    useTimelineStore.getState().selectClip(marker.clipId)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setMenu({ type: 'transition', id: marker.clipId, x: event.clientX, y: event.clientY })
                  }}
                />
              ))}

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
