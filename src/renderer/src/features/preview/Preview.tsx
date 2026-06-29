import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { useTransportStore } from '../../stores/transportStore'
import { useCanvasCompositor } from './webcodecs/useCanvasCompositor'
import { useTimelineAudio } from './audio/useTimelineAudio'
import { Transport } from './Transport'
import { ClipInspector } from './ClipInspector'
import { TextInspector } from './TextInspector'
import styles from './Preview.module.css'

export function Preview() {
  const { t } = useTranslation()
  const hasClips = useTimelineStore((state) => Object.keys(state.model.clips).length > 0)
  const selectedOverlayId = useTimelineStore((state) => state.selectedOverlayId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Latest decoded frame size, pushed by the worker — needed to undo object-fit
  // letterboxing when mapping a pointer onto the frame for text drag-to-position.
  const frameSizeRef = useRef({ width: 0, height: 0 })
  const dragRef = useRef<{ id: string; origX: number; origY: number; grabX: number; grabY: number } | null>(null)

  // Video is composited on the canvas (WebCodecs); audio is the master clock
  // (Web Audio) that the canvas follows. No media elements.
  useCanvasCompositor(canvasRef, frameSizeRef)
  useTimelineAudio()

  // Pointer (client px) → normalized frame position, accounting for object-fit:
  // contain (the drawn frame is centered and letterboxed within the element).
  const mapPointer = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = canvasRef.current
    const fs = frameSizeRef.current
    if (!el || fs.width <= 0 || fs.height <= 0) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const scale = Math.min(rect.width / fs.width, rect.height / fs.height)
    const dispW = fs.width * scale
    const dispH = fs.height * scale
    const offX = rect.left + (rect.width - dispW) / 2
    const offY = rect.top + (rect.height - dispH) / 2
    return { x: (clientX - offX) / dispW, y: (clientY - offY) / dispH }
  }

  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

  // Drag moves the selected overlay by the pointer's delta (no jump on click); the
  // overlay must be visible at the playhead so the user can see it move.
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const state = useTimelineStore.getState()
    const id = state.selectedOverlayId
    if (!id) return
    const overlay = state.model.textOverlays.find((candidate) => candidate.id === id)
    if (!overlay) return
    const playhead = useTransportStore.getState().playheadTime
    if (playhead < overlay.start || playhead >= overlay.start + overlay.duration) return
    const grab = mapPointer(event.clientX, event.clientY)
    if (!grab) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id, origX: overlay.x, origY: overlay.y, grabX: grab.x, grabY: grab.y }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const point = mapPointer(event.clientX, event.clientY)
    if (!point) return
    const x = clamp01(drag.origX + (point.x - drag.grabX))
    const y = clamp01(drag.origY + (point.y - drag.grabY))
    useTimelineStore.getState().dragOverlayPosition(drag.id, x, y)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    useTimelineStore.getState().commitOverlayPosition(drag.id, drag.origX, drag.origY)
  }

  return (
    <div className={styles.preview}>
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={selectedOverlayId ? `${styles.canvas} ${styles.canvasDraggable}` : styles.canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!hasClips ? <div className={styles.empty}>{t('preview.empty')}</div> : null}
      </div>
      <ClipInspector />
      <TextInspector />
      <Transport />
    </div>
  )
}
