/** The authoritative edit model. Pure data — owned by the renderer timeline
 * store and read (never mutated) by the preview engine and the exporter. */

export type TrackKind = 'video' | 'audio'

export interface Track {
  id: string
  kind: TrackKind
  /** Display order, top to bottom. Video tracks above audio tracks. */
  index: number
  /** Short label, e.g. "V1", "A1". */
  label: string
  /** Silences this track's clips in preview and export. */
  muted: boolean
  /** When any track is soloed, only soloed tracks are audible. */
  solo: boolean
}

export interface DenoiseSettings {
  enabled: boolean
  /** 0..1. */
  strength: number
}

export interface Clip {
  id: string
  /** References a MediaItem.id in the media store. */
  mediaId: string
  trackId: string
  /** Position on the timeline, in seconds. */
  startOnTimeline: number
  /** In/out points into the source media, in seconds. */
  sourceIn: number
  sourceOut: number
  /** Playback rate; 1 = normal. Affects timeline length. */
  speed: number
  /** Gain 0..1+ applied in preview and export. */
  volume: number
  /** Audio fade-in / fade-out at the clip edges, in timeline seconds (0 = none). */
  fadeIn: number
  fadeOut: number
  /** Silences just this clip in preview and export. */
  muted: boolean
  denoise: DenoiseSettings
}

export interface TimelineModel {
  tracks: Track[]
  /** Clips keyed by id. */
  clips: Record<string, Clip>
  /** Timeline annotations in seconds (sorted); navigation + snap targets. */
  markers: number[]
}
