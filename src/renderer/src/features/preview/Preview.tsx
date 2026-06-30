import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FontFamily, TextOverlay } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useTransportStore } from '../../stores/transportStore'
import { useCanvasCompositor } from './webcodecs/useCanvasCompositor'
import { useTimelineAudio } from './audio/useTimelineAudio'
import { Transport } from './Transport'
import { ClipInspector } from './ClipInspector'
import { TextInspector } from './TextInspector'
import styles from './Preview.module.css'

// A throwaway canvas used only to measure text width on the main thread (matching
// the worker's font), so we can hit-test a click against a text overlay's bounds.
let measureCanvas: HTMLCanvasElement | null = null
function measureContext(): CanvasRenderingContext2D | null {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  return measureCanvas.getContext('2d')
}

function cssFontFamily(family: FontFamily): string {
  return family === 'serif' ? 'serif' : family === 'mono' ? 'monospace' : 'sans-serif'
}

/** True if a normalized (0..1) point lands on any line's box of this overlay —
 * mirrors the worker's multi-line / alignment layout. */
function hitsOverlay(overlay: TextOverlay, nx: number, ny: number, frameW: number, frameH: number): boolean {
  const c = measureContext()
  if (!c) return false
  const sizePx = Math.max(1, overlay.fontSize * frameH)
  const lineHeightN = (sizePx * 1.2) / frameH
  const sizeN = sizePx / frameH
  const padXN = (sizePx * 0.25) / frameW
  const padYN = (sizePx * 0.25) / frameH
  c.font = `bold ${sizePx}px ${cssFontFamily(overlay.fontFamily)}`
  const lines = overlay.text.split('\n')
  const firstCenterYN = overlay.y - ((lines.length - 1) / 2) * lineHeightN
  for (let i = 0; i < lines.length; i += 1) {
    const cyN = firstCenterYN + i * lineHeightN
    // Min width keeps short/blank lines grabbable.
    const lineWN = Math.max(c.measureText(lines[i] ?? '').width, sizePx * 0.5) / frameW
    const leftN =
      overlay.align === 'left'
        ? overlay.x - padXN
        : overlay.align === 'right'
          ? overlay.x - lineWN - padXN
          : overlay.x - lineWN / 2 - padXN
    const inX = nx >= leftN && nx <= leftN + lineWN + padXN * 2
    const inY = ny >= cyN - sizeN / 2 - padYN && ny <= cyN + sizeN / 2 + padYN
    if (inX && inY) return true
  }
  return false
}

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

  // Click a visible text to select it (hit-test against its measured bounds), then
  // drag it in the same gesture. Clicking empty space deselects. Drag moves by the
  // pointer's delta (no jump on click).
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const grab = mapPointer(event.clientX, event.clientY)
    const fs = frameSizeRef.current
    if (!grab || fs.width <= 0 || fs.height <= 0) return
    const state = useTimelineStore.getState()
    const playhead = useTransportStore.getState().playheadTime
    const visible = state.model.textOverlays.filter(
      (overlay) => playhead >= overlay.start && playhead < overlay.start + overlay.duration
    )
    // Topmost first: later overlays are drawn on top.
    let hit: TextOverlay | null = null
    for (let i = visible.length - 1; i >= 0; i -= 1) {
      const overlay = visible[i]
      if (overlay && hitsOverlay(overlay, grab.x, grab.y, fs.width, fs.height)) {
        hit = overlay
        break
      }
    }
    if (!hit) {
      if (state.selectedOverlayId) state.selectOverlay(null)
      return
    }
    if (state.selectedOverlayId !== hit.id) state.selectOverlay(hit.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: hit.id, origX: hit.x, origY: hit.y, grabX: grab.x, grabY: grab.y }
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
