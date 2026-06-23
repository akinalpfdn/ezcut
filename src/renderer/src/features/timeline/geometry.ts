import { clipTimelineEnd, type TimelineModel } from '@shared'

/** Snap targets in seconds: timeline start, playhead, markers, and every other
 * clip's edges. */
export function collectSnapPoints(
  model: TimelineModel,
  excludeClipId: string | null,
  playheadTime: number
): number[] {
  const points = [0, playheadTime, ...model.markers]
  for (const clip of Object.values(model.clips)) {
    if (clip.id === excludeClipId) continue
    points.push(clip.startOnTimeline, clipTimelineEnd(clip))
  }
  return points
}

/** Returns the nearest snap point within the threshold, otherwise the value itself. */
export function snapValue(value: number, points: number[], thresholdSeconds: number): number {
  let best = value
  let bestDistance = thresholdSeconds
  for (const point of points) {
    const distance = Math.abs(point - value)
    if (distance < bestDistance) {
      bestDistance = distance
      best = point
    }
  }
  return best
}
