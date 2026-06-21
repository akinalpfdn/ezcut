import type { Clip, TimelineModel, Track } from './types'

/** Length the clip occupies on the timeline, accounting for speed. */
export function clipTimelineDuration(clip: Clip): number {
  const sourceLength = Math.max(0, clip.sourceOut - clip.sourceIn)
  const speed = clip.speed > 0 ? clip.speed : 1
  return sourceLength / speed
}

export function clipTimelineEnd(clip: Clip): number {
  return clip.startOnTimeline + clipTimelineDuration(clip)
}

/** Maps a timeline time to the corresponding time in the clip's source media. */
export function timelineTimeToSource(clip: Clip, timelineTime: number): number {
  const speed = clip.speed > 0 ? clip.speed : 1
  return clip.sourceIn + (timelineTime - clip.startOnTimeline) * speed
}

/** Total timeline duration: the latest clip end across all tracks. */
export function timelineDuration(model: TimelineModel): number {
  let max = 0
  for (const clip of Object.values(model.clips)) {
    const end = clipTimelineEnd(clip)
    if (end > max) max = end
  }
  return max
}

/** Clips on a track, ordered by their timeline start. */
export function getTrackClips(model: TimelineModel, trackId: string): Clip[] {
  return Object.values(model.clips)
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startOnTimeline - b.startOnTimeline)
}

export function getTracksSorted(model: TimelineModel): Track[] {
  return [...model.tracks].sort((a, b) => a.index - b.index)
}

/**
 * Clips on one track may never overlap. Returns a start for a clip of `duration`
 * near `desiredStart` that does not overlap any other clip — pushing it past any
 * clip it would collide with (so a drop onto existing content lands at the end).
 */
export function resolveNonOverlappingStart(
  model: TimelineModel,
  trackId: string,
  desiredStart: number,
  duration: number,
  excludeClipId?: string
): number {
  const others = getTrackClips(model, trackId).filter((clip) => clip.id !== excludeClipId)
  let start = Math.max(0, desiredStart)
  for (let pass = 0; pass <= others.length; pass++) {
    const hit = others.find(
      (clip) => start < clipTimelineEnd(clip) && start + duration > clip.startOnTimeline
    )
    if (!hit) break
    start = clipTimelineEnd(hit)
  }
  return start
}

/** End of the nearest clip to the left of `referenceStart` on the track (or 0). */
export function previousClipEnd(
  model: TimelineModel,
  trackId: string,
  referenceStart: number,
  excludeClipId?: string
): number {
  let end = 0
  for (const clip of getTrackClips(model, trackId)) {
    if (clip.id === excludeClipId) continue
    if (clip.startOnTimeline < referenceStart) end = Math.max(end, clipTimelineEnd(clip))
  }
  return end
}

/** Start of the nearest clip to the right of `referenceStart` on the track (or Infinity). */
export function nextClipStart(
  model: TimelineModel,
  trackId: string,
  referenceStart: number,
  excludeClipId?: string
): number {
  let start = Number.POSITIVE_INFINITY
  for (const clip of getTrackClips(model, trackId)) {
    if (clip.id === excludeClipId) continue
    if (clip.startOnTimeline > referenceStart) start = Math.min(start, clip.startOnTimeline)
  }
  return start
}
