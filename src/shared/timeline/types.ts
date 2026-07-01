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
  /** Keep the original pitch when speed != 1 (tempo change, not resample). */
  preservePitch: boolean
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
  /** Zoom relative to the contain-fit size in the composition (1 = fit). */
  scale: number
  /** Pan as a fraction of the composition (0 = centred). */
  posX: number
  posY: number
}

/** Text overlay font family: a generic preset ('sans'/'serif'/'mono') or any
 * installed system font family name. Both the canvas preview and the ASS exporter
 * resolve it by name. */
export type FontFamily = string
/** Built-in generic presets, shown first in the picker; resolve to platform defaults. */
export const FONT_FAMILIES: FontFamily[] = ['sans', 'serif', 'mono']

/** Horizontal alignment of a (possibly multi-line) text overlay relative to its anchor. */
export type TextAlign = 'left' | 'center' | 'right'
export const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right']

/** Text fill: a solid colour or a gradient. */
export type FillType = 'solid' | 'linear' | 'radial'
export const FILL_TYPES: FillType[] = ['solid', 'linear', 'radial']

/** Shape of the background drawn behind a text overlay (when `background` is on). */
export type BubbleShape = 'rounded' | 'pill' | 'speech' | 'tape' | 'banner' | 'bar'
export const BUBBLE_SHAPES: BubbleShape[] = ['rounded', 'pill', 'speech', 'tape', 'banner', 'bar']

/** Letter-case transform applied to a text overlay at render time. */
export type TextCase = 'none' | 'upper' | 'lower' | 'title'
export const TEXT_CASES: TextCase[] = ['none', 'upper', 'lower', 'title']

/** Font weights offered by the weight picker (light → black). */
export const FONT_WEIGHTS: number[] = [300, 400, 500, 700, 900]

/** One-click text effect applied to the glyphs (exclusive, Canva-style). */
export type TextEffect =
  | 'none'
  | 'shadow'
  | 'outline'
  | 'hollow'
  | 'lift'
  | 'splice'
  | 'echo'
  | 'glitch'
  | 'neon'
export const TEXT_EFFECTS: TextEffect[] = [
  'none',
  'shadow',
  'outline',
  'hollow',
  'lift',
  'splice',
  'echo',
  'glitch',
  'neon'
]

/** In/out animation preset for a text overlay (applied at its start/end edges). */
export type TextAnimation =
  | 'none'
  | 'fade'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'scale'
  | 'pop'
  | 'bounce'
  | 'rise'
  | 'spin'
  | 'blurIn'
  | 'wave'
  | 'typewriter'
  | 'revealWord'
export const TEXT_ANIMATIONS: TextAnimation[] = [
  'none',
  'fade',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'scale',
  'pop',
  'bounce',
  'rise',
  'spin',
  'blurIn',
  'wave',
  'typewriter',
  'revealWord'
]

/** Continuous looping animation that runs across the whole overlay duration. */
export type TextLoop = 'none' | 'pulse' | 'wiggle' | 'shake' | 'breathe' | 'blink'
export const TEXT_LOOPS: TextLoop[] = ['none', 'pulse', 'wiggle', 'shake', 'breathe', 'blink']

/** Easing curve applied to in/out animations. */
export type Easing = 'linear' | 'easeOut' | 'easeInOut' | 'back'
export const EASINGS: Easing[] = ['linear', 'easeOut', 'easeInOut', 'back']

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
  /** Hex color, e.g. "#ffffff" (used when fillType is 'solid'). */
  color: string
  /** Fill type; gradient uses gradientFrom/To/Angle. */
  fillType: FillType
  gradientFrom: string
  gradientTo: string
  /** Linear gradient angle in degrees. */
  gradientAngle: number
  /** Draw a shaped background behind the text for legibility (master on/off). */
  background: boolean
  /** Which background shape to draw when `background` is on. */
  bubble: BubbleShape
  fontFamily: FontFamily
  /** Horizontal alignment of the text block (matters for multi-line). */
  align: TextAlign
  bold: boolean
  italic: boolean
  /** Extra weight (100–900). Effective weight = bold ? max(700, fontWeight) : fontWeight. */
  fontWeight: number
  /** Letter spacing as a fraction of font size (0 = normal). */
  letterSpacing: number
  /** Line-height multiplier for multi-line text (1.2 = default). */
  lineSpacing: number
  /** Letter-case transform. */
  textCase: TextCase
  underline: boolean
  strikethrough: boolean
  /** Glyph effect (exclusive). effectColor/Intensity/Direction parameterise it. */
  effect: TextEffect
  effectColor: string
  /** 0..1: scales the effect's offset / blur / stroke width. */
  effectIntensity: number
  /** Direction (degrees) of the effect's offset (shadow/echo/glitch). */
  effectDirection: number
  /** Background box appearance (when `background`). Radius/padding are fractions of font size. */
  boxColor: string
  boxOpacity: number
  boxRadius: number
  boxPadding: number
  /** Text fill opacity, 0..1. */
  opacity: number
  /** Rotation in degrees, clockwise, around the anchor. */
  rotation: number
  /** Entry/exit animations and their durations (seconds). */
  animationIn: TextAnimation
  animationOut: TextAnimation
  animInDuration: number
  animOutDuration: number
  /** Easing curve for the in/out animations. */
  easing: Easing
  /** Continuous loop animation across the whole overlay (independent of in/out). */
  loop: TextLoop
}

/** Project aspect ratio (the composition frame the video is fitted into). */
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5'
export const ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:5']

const ASPECT_WH: Record<AspectRatio, [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:5': [4, 5]
}

/** Composition pixel size for an aspect, fitting within longEdge (even dimensions). */
export function compositionSize(aspect: AspectRatio, longEdge: number): { width: number; height: number } {
  const [aw, ah] = ASPECT_WH[aspect]
  const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)
  if (aw >= ah) return { width: even(longEdge), height: even((longEdge * ah) / aw) }
  return { width: even((longEdge * aw) / ah), height: even(longEdge) }
}

export interface TimelineModel {
  tracks: Track[]
  /** Clips keyed by id. */
  clips: Record<string, Clip>
  /** Timeline annotations in seconds (sorted); navigation + snap targets. */
  markers: number[]
  /** Text titles rendered over the video. */
  textOverlays: TextOverlay[]
  /** Composition aspect ratio. */
  aspectRatio: AspectRatio
}
