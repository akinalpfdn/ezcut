import { useTimelineStore } from '../../stores/timelineStore'
import styles from './Playhead.module.css'

/** Subscribes only to playhead + zoom so 60fps playback re-renders just this line,
 * not the whole timeline. */
export function Playhead({ height }: { height: number }) {
  const playheadTime = useTimelineStore((state) => state.playheadTime)
  const pxPerSec = useTimelineStore((state) => state.pxPerSec)
  return <div className={styles.playhead} style={{ left: playheadTime * pxPerSec, height }} />
}
