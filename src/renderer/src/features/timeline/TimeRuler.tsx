import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useTimelineStore } from '../../stores/timelineStore'
import styles from './TimeRuler.module.css'

const TICK_INTERVALS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
const DESIRED_LABEL_SPACING_PX = 90

function chooseInterval(pxPerSec: number): number {
  const target = DESIRED_LABEL_SPACING_PX / pxPerSec
  return TICK_INTERVALS.find((interval) => interval >= target) ?? TICK_INTERVALS[TICK_INTERVALS.length - 1]
}

function formatTick(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

interface TimeRulerProps {
  pxPerSec: number
  width: number
  onSeek: (time: number) => void
}

export function TimeRuler({ pxPerSec, width, onSeek }: TimeRulerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const markers = useTimelineStore((state) => state.model.markers)
  const interval = chooseInterval(pxPerSec)
  const totalSeconds = width / pxPerSec
  const count = Math.floor(totalSeconds / interval) + 1
  const ticks = Array.from({ length: count }, (_, index) => index * interval)

  function seekFromEvent(event: ReactPointerEvent<HTMLDivElement>): void {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    onSeek(Math.max(0, (event.clientX - rect.left) / pxPerSec))
  }

  return (
    <div
      ref={ref}
      className={styles.ruler}
      style={{ width }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        seekFromEvent(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seekFromEvent(event)
      }}
    >
      {ticks.map((time) => (
        <div key={time} className={styles.tick} style={{ left: time * pxPerSec }}>
          <span className={styles.tickLabel}>{formatTick(time)}</span>
        </div>
      ))}
      {markers.map((time) => (
        <div key={`m-${time}`} className={styles.marker} style={{ left: time * pxPerSec }} />
      ))}
    </div>
  )
}
