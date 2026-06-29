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

/** Transition types — each maps to an ffmpeg xfade transition (export) and a
 * canvas blend (preview). */
export type TransitionType =
  | 'crossfade'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoomIn'
  | 'wipeLeft'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown'
  | 'circleOpen'
  | 'circleClose'

/** Order shown in the picker. */
export const TRANSITION_TYPES: TransitionType[] = [
  'crossfade',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
  'zoomIn',
  'wipeLeft',
  'wipeRight',
  'wipeUp',
  'wipeDown',
  'circleOpen',
  'circleClose'
]

/** A transition at a clip's outgoing edge into the next adjacent clip. The two
 * clips overlap by `duration` seconds (the blend region). */
export interface Transition {
  type: TransitionType
  duration: number
}

/** Per-clip audio cleanup/enhancement applied on export (ffmpeg filters). */
export interface AudioFx {
  /** Loudness normalization to a target LUFS (EBU R128). */
  normalize: boolean
  /** Noise gate — silences low-level noise between speech. */
  gate: boolean
  /** Dynamics compressor — evens out levels. */
  compressor: boolean
  /** 3-band EQ (gains in dB; 0 = flat). */
  eq: boolean
  eqLow: number
  eqMid: number
  eqHigh: number
}

export const DEFAULT_AUDIO_FX: AudioFx = {
  normalize: false,
  gate: false,
  compressor: false,
  eq: false,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0
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
  /** Audio cleanup/enhancement applied on export. */
  audioFx: AudioFx
  /** Transition into the next adjacent clip on this track (overlap blend). */
  transitionOut?: Transition
}

/** Text overlay font family (maps to a canvas generic + an ffmpeg fontconfig family). */
export type FontFamily = 'sans' | 'serif' | 'mono'
export const FONT_FAMILIES: FontFamily[] = ['sans', 'serif', 'mono']

/** A time-ranged text title rendered on top of the video (its own overlay layer,
 * not a media clip). Position/size are normalized to the frame so they scale across
 * resolutions. */
export interface TextOverlay {
  id: string
  text: string
  /** Timeline placement, in seconds. */
  start: number
  duration: number
  /** Anchor (text centre) as a 0..1 fraction of frame width/height. */
  x: number
  y: number
  /** Font size as a fraction of frame height (e.g. 0.06 = 6%). */
  fontSize: number
  /** Hex color, e.g. "#ffffff". */
  color: string
  /** Draw a translucent box behind the text for legibility. */
  background: boolean
  fontFamily: FontFamily
}

export interface TimelineModel {
  tracks: Track[]
  /** Clips keyed by id. */
  clips: Record<string, Clip>
  /** Timeline annotations in seconds (sorted); navigation + snap targets. */
  markers: number[]
  /** Text titles rendered over the video. */
  textOverlays: TextOverlay[]
}
