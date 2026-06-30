import type { TextAnimation, TextOverlay } from '@shared'
import { resolveFamilyFontName } from './textFont'

// Generates an ASS (Advanced SubStation Alpha) subtitle document for the text
// overlays, rendered on export via ffmpeg's `subtitles`/`ass` filter (libass).
// ASS is the production rich-text path: it does outline, shadow, opaque boxes,
// rotation, and animation that drawtext cannot. Positions/sizes are authored in
// the export's pixel space (PlayResX/Y = export size), mirroring the canvas preview.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Seconds → ASS timecode H:MM:SS.cs (centiseconds). */
export function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs % 100)}`
}

/** #RRGGBB → ASS inline colour body `&HBBGGRR&` (ASS colours are BGR). */
export function assColor(hex: string): string {
  const h = hex.replace('#', '').padEnd(6, '0')
  const r = h.slice(0, 2)
  const g = h.slice(2, 4)
  const b = h.slice(4, 6)
  return `&H${b}${g}${r}&`.toUpperCase()
}

/** Opacity 0..1 → ASS alpha body `&HXX&` (ASS alpha is inverted: 00 opaque, FF clear). */
export function assAlpha(opacity: number): string {
  const a = Math.max(0, Math.min(255, Math.round((1 - opacity) * 255)))
  return `&H${a.toString(16).padStart(2, '0').toUpperCase()}&`
}

// Horizontal alignment → ASS numpad anchor (vertical is always middle, since our
// y is the block's vertical centre): left edge / centre / right edge at \pos.
const ALIGN_AN: Record<TextOverlay['align'], number> = { left: 4, center: 5, right: 6 }

/** Escapes user text for an ASS event: newlines become hard breaks; characters
 * that would be parsed as ASS syntax (override braces, backslash) are neutralised. */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '/')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, '\\N')
}

const HEADER = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'WrapStyle: 2',
  'ScaledBorderAndShadow: yes'
]

// Two base styles; everything else is overridden per-event. BorderStyle cannot be
// set inline, so box-on vs box-off needs distinct styles: Plain = outline style
// (we use shadow only), Box = opaque box (BorderStyle 3, BackColour is the box).
const STYLES = [
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Plain,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H66000000,0,0,0,0,100,100,0,0,1,0,2,5,0,0,0,1',
  'Style: Box,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,18,2,5,0,0,0,1'
]

const EVENTS_FORMAT = [
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
]

const ANIM_SLIDE = 0.12 // entry offset as a fraction of the frame height

function isSlide(a: TextAnimation): boolean {
  return a === 'slideUp' || a === 'slideDown' || a === 'slideLeft' || a === 'slideRight'
}
function isScale(a: TextAnimation): boolean {
  return a === 'scale' || a === 'pop'
}
/** Entry offset (px) for a slide: where the text sits before sliding to its place. */
function slideOffset(a: TextAnimation, height: number): [number, number] {
  const d = Math.round(ANIM_SLIDE * height)
  if (a === 'slideUp') return [0, d]
  if (a === 'slideDown') return [0, -d]
  if (a === 'slideLeft') return [d, 0]
  if (a === 'slideRight') return [-d, 0]
  return [0, 0]
}

/** ASS position + animation tags (fade/move/scale) for an overlay's in/out presets. */
function animationTags(
  overlay: TextOverlay,
  x: number,
  y: number,
  height: number
): { posTag: string; animTags: string } {
  const durMs = Math.round(overlay.duration * 1000)
  const inMs = Math.round(overlay.animInDuration * 1000)
  const outMs = Math.round(overlay.animOutDuration * 1000)
  const { animationIn: animIn, animationOut: animOut } = overlay

  // Position: a slide replaces \pos with \move. (\move does one segment, so an
  // in-slide takes priority; a paired out-slide leans on the fade.)
  let posTag = `\\pos(${x},${y})`
  if (isSlide(animIn)) {
    const [ox, oy] = slideOffset(animIn, height)
    posTag = `\\move(${x + ox},${y + oy},${x},${y},0,${inMs})`
  } else if (isSlide(animOut)) {
    const [ox, oy] = slideOffset(animOut, height)
    posTag = `\\move(${x},${y},${x + ox},${y + oy},${Math.max(0, durMs - outMs)},${durMs})`
  }

  // Fade applies to every non-none animation (looks better and is the export of pop/scale's opacity).
  const fadeIn = animIn !== 'none' ? inMs : 0
  const fadeOut = animOut !== 'none' ? outMs : 0
  const fade = fadeIn || fadeOut ? `\\fad(${fadeIn},${fadeOut})` : ''

  let scale = ''
  const scaleIn = isScale(animIn)
  const scaleOut = isScale(animOut)
  if (scaleIn || scaleOut) {
    const baseScale = scaleIn ? 0 : 100
    scale = `\\fscx${baseScale}\\fscy${baseScale}`
    if (scaleIn) scale += `\\t(0,${inMs},\\fscx100\\fscy100)`
    if (scaleOut) scale += `\\t(${Math.max(0, durMs - outMs)},${durMs},\\fscx0\\fscy0)`
  }
  return { posTag, animTags: `${fade}${scale}` }
}

/** Builds the full .ass document text for the overlays at the given export size. */
export function buildAssDocument(overlays: readonly TextOverlay[], width: number, height: number): string {
  const playRes = [`PlayResX: ${width}`, `PlayResY: ${height}`]
  const events = overlays.flatMap((overlay) => {
    const size = Math.max(1, Math.round(overlay.fontSize * height))
    const x = Math.round(overlay.x * width)
    const y = Math.round(overlay.y * height)
    const an = ALIGN_AN[overlay.align]
    const fontName = resolveFamilyFontName(overlay.fontFamily)
    const shadow = Math.max(1, Math.round(size * 0.03))
    const fillAlpha = assAlpha(overlay.opacity)
    const frz = overlay.rotation ? `\\frz${-overlay.rotation}` : '' // ASS rotates CCW; ours is CW
    const { posTag, animTags } = animationTags(overlay, x, y, height)
    // Tags shared by every layer of this overlay (position + animation included).
    const base = `\\an${an}${posTag}\\fn${fontName}\\fs${size}\\1c${assColor(overlay.color)}\\1a${fillAlpha}${overlay.bold ? '\\b1' : '\\b0'}${overlay.italic ? '\\i1' : '\\i0'}${frz}${animTags}`
    const start = assTime(overlay.start)
    const end = assTime(overlay.start + overlay.duration)
    const text = escapeAssText(overlay.text)
    const hasOutline = overlay.outlineWidth > 0
    const outline = `\\bord${Math.round(size * overlay.outlineWidth)}\\3c${assColor(overlay.outlineColor)}\\3a${fillAlpha}`

    if (overlay.background) {
      const pad = Math.max(1, Math.round(size * overlay.boxPadding))
      // BorderStyle=3 box: \bord is the padding, the box is filled with the OUTLINE
      // colour (\3c/\3a), not BackColour (verified against libass).
      const boxShadow = hasOutline ? '\\shad0' : `\\shad${shadow}`
      const box = `Dialogue: 0,${start},${end},Box,,0,0,0,,{${base}\\bord${pad}\\3c${assColor(overlay.boxColor)}\\3a${assAlpha(overlay.boxOpacity)}${boxShadow}}${text}`
      if (!hasOutline) return [box]
      // BorderStyle can't be inline, so an outlined text-on-box needs a second
      // layer above the box (same pos/text, so it overlays exactly).
      const textLayer = `Dialogue: 1,${start},${end},Plain,,0,0,0,,{${base}${outline}\\shad${shadow}}${text}`
      return [box, textLayer]
    }

    const tags = hasOutline ? `${base}${outline}\\shad${shadow}` : `${base}\\bord0\\shad${shadow}`
    return [`Dialogue: 0,${start},${end},Plain,,0,0,0,,{${tags}}${text}`]
  })
  return [...HEADER, ...playRes, '', ...STYLES, '', ...EVENTS_FORMAT, ...events, ''].join('\n')
}
