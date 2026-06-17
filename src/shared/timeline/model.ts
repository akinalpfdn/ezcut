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
