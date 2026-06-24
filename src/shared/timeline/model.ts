import type { Clip, TimelineModel, Track, TrackKind } from './types'
import type { MediaKind } from '../media/types'

/** Which track kind a media item belongs on: images share the video track. */
export function trackKindForMedia(kind: MediaKind): TrackKind {
  return kind === 'audio' ? 'audio' : 'video'
}

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

/**
 * Whether a clip's audio should be heard, applying clip mute, track mute, and
 * solo: if any track is soloed, only soloed tracks are audible. Shared by the
 * preview audio engine and the exporter so both stay in sync.
 */
export function isClipAudible(model: TimelineModel, clip: Clip): boolean {
  if (clip.muted) return false
  const track = model.tracks.find((candidate) => candidate.id === clip.trackId)
  if (!track || track.muted) return false
  if (model.tracks.some((candidate) => candidate.solo)) return track.solo
  return true
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

/**
 * Where to split a clip at a timeline time: the source-time cut point plus the
 * local offset into the clip. Returns null if the cut is within minClipDuration
 * of either edge (too small a piece). Pure — the caller assigns clip ids.
 */
export function splitPoint(
  clip: Clip,
  timelineTime: number,
  minClipDuration: number
): { sourceSplit: number; localSeconds: number } | null {
  const localSeconds = timelineTime - clip.startOnTimeline
  const duration = clipTimelineDuration(clip)
  if (localSeconds <= minClipDuration || localSeconds >= duration - minClipDuration) return null
  const speed = clip.speed > 0 ? clip.speed : 1
  return { sourceSplit: clip.sourceIn + localSeconds * speed, localSeconds }
}

/** Whether `next` can merge into `first`: same media + speed, and contiguous on
 * both the timeline and the source (within `tolerance`). */
export function canMerge(first: Clip, next: Clip, tolerance: number): boolean {
  if (next.mediaId !== first.mediaId || next.speed !== first.speed) return false
  const contiguousOnTimeline = Math.abs(next.startOnTimeline - clipTimelineEnd(first)) <= tolerance
  const contiguousInSource = Math.abs(next.sourceIn - first.sourceOut) <= tolerance
  return contiguousOnTimeline && contiguousInSource
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
