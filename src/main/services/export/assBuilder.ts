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

/** Interpolates two hex colours and returns the ASS colour at fraction t (0..1). */
export function assColorLerp(from: string, to: string, t: number): string {
  const a = from.replace('#', '').padEnd(6, '0')
  const b = to.replace('#', '').padEnd(6, '0')
  const mix = (i: number): number =>
    Math.round(parseInt(a.slice(i, i + 2), 16) + (parseInt(b.slice(i, i + 2), 16) - parseInt(a.slice(i, i + 2), 16)) * t)
  const hex = (n: number): string => n.toString(16).padStart(2, '0')
  return `&H${hex(mix(4))}${hex(mix(2))}${hex(mix(0))}&`.toUpperCase()
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

// One base style; everything else is overridden per-event. Backgrounds are drawn
// as \p vector shapes on their own layer (not opaque boxes), so a single outline
// style suffices.
const STYLES = [
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Plain,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H66000000,0,0,0,0,100,100,0,0,1,0,2,5,0,0,0,1'
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

/** ASS text body that reveals one character at a time over durationMs (typewriter).
 * Each char starts transparent (\alpha FF) and flips visible at its slot via \t. */
function typewriterText(text: string, durationMs: number): string {
  const chars = [...text]
  const visible = Math.max(1, chars.filter((ch) => ch !== '\n').length)
  let shown = 0
  let out = ''
  for (const ch of chars) {
    if (ch === '\n') {
      out += '\\N'
      continue
    }
    const t = Math.round((shown / visible) * durationMs)
    out += `{\\alpha&HFF&\\t(${t},${t + 1},\\alpha&H00&)}${escapeAssText(ch)}`
    shown += 1
  }
  return out
}

/** ASS text body with a per-character colour interpolation — approximates a linear
 * gradient (libass has no native text gradient). */
function gradientText(text: string, from: string, to: string): string {
  const chars = [...text]
  const visible = Math.max(1, chars.filter((ch) => ch !== '\n').length)
  let i = 0
  let out = ''
  for (const ch of chars) {
    if (ch === '\n') {
      out += '\\N'
      continue
    }
    const f = visible === 1 ? 0 : i / (visible - 1)
    out += `{\\1c${assColorLerp(from, to, f)}}${escapeAssText(ch)}`
    i += 1
  }
  return out
}

// libass can't measure fonts, so \p bubble shapes are sized from an estimated
// text width (avg glyph ≈ this fraction of the font size). Slightly generous so
// the shape doesn't clip the text. 'rounded' avoids this by using the auto-sized
// BorderStyle=3 box instead.
const EST_CHAR_W = 0.58

/** ASS \p drawing commands for a rounded rectangle w×h with corner radius r. */
function roundRectAss(w: number, h: number, r: number): string {
  const rad = Math.max(0, Math.min(r, Math.floor(w / 2), Math.floor(h / 2)))
  const k = Math.round(rad * 0.4477) // control-point offset for a bezier quarter-arc
  return [
    `m ${rad} 0`,
    `l ${w - rad} 0`,
    `b ${w - rad + k} 0 ${w} ${rad - k} ${w} ${rad}`,
    `l ${w} ${h - rad}`,
    `b ${w} ${h - rad + k} ${w - rad + k} ${h} ${w - rad} ${h}`,
    `l ${rad} ${h}`,
    `b ${rad - k} ${h} 0 ${h - rad + k} 0 ${h - rad}`,
    `l 0 ${rad}`,
    `b 0 ${rad - k} ${rad - k} 0 ${rad} 0`
  ].join(' ')
}

/** ASS \p drawing for a bubble shape, in a w×h box with origin at its top-left.
 * Mirrors the canvas preview shapes (drawBubbleShape). */
function bubbleDrawing(shape: TextOverlay['bubble'], w: number, h: number, size: number, radiusPx: number): string {
  switch (shape) {
    case 'pill':
      return roundRectAss(w, h, Math.floor(h / 2))
    case 'tape': {
      const s = Math.round(h * 0.35)
      return `m ${s} 0 l ${w} 0 l ${w - s} ${h} l 0 ${h}`
    }
    case 'banner': {
      const n = Math.round(h * 0.4)
      const hm = Math.round(h / 2)
      return `m 0 0 l ${w} 0 l ${w - n} ${hm} l ${w} ${h} l 0 ${h} l ${n} ${hm}`
    }
    case 'speech': {
      const r = Math.min(Math.round(size * 0.35), Math.floor(h / 2), Math.floor(w / 2))
      const tailY = h + Math.round(size * 0.4)
      // Rounded body + a second subpath for the downward tail (fill unions them).
      return `${roundRectAss(w, h, r)} m ${Math.round(w * 0.22)} ${h} l ${Math.round(w * 0.4)} ${h} l ${Math.round(w * 0.26)} ${tailY}`
    }
    case 'bar': {
      const top = Math.round(h * 0.52)
      const bot = Math.round(h * 0.94)
      return `m 0 ${top} l ${w} ${top} l ${w} ${bot} l 0 ${bot}`
    }
    case 'rounded':
    default:
      return roundRectAss(w, h, radiusPx)
  }
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
    const fillAlpha = assAlpha(overlay.opacity)
    const frz = overlay.rotation ? `\\frz${-overlay.rotation}` : '' // ASS rotates CCW; ours is CW
    // Typewriter-in needs a per-character body, so it bypasses the move/scale tags
    // (out animation still fades). Everything else uses the standard animation tags.
    let posTag: string
    let animTags: string
    let text: string
    if (overlay.animationIn === 'typewriter') {
      posTag = `\\pos(${x},${y})`
      const outMs = overlay.animationOut !== 'none' ? Math.round(overlay.animOutDuration * 1000) : 0
      animTags = outMs ? `\\fad(0,${outMs})` : ''
      text = typewriterText(overlay.text, Math.round(overlay.animInDuration * 1000))
    } else {
      const tags = animationTags(overlay, x, y, height)
      posTag = tags.posTag
      animTags = tags.animTags
      text =
        overlay.fillType !== 'solid'
          ? gradientText(overlay.text, overlay.gradientFrom, overlay.gradientTo)
          : escapeAssText(overlay.text)
    }
    // Tags shared by every layer of this overlay (position + animation included).
    const base = `\\an${an}${posTag}\\fn${fontName}\\fs${size}\\1c${assColor(overlay.color)}\\1a${fillAlpha}${overlay.bold ? '\\b1' : '\\b0'}${overlay.italic ? '\\i1' : '\\i0'}${frz}${animTags}`
    const start = assTime(overlay.start)
    const end = assTime(overlay.start + overlay.duration)
    const bi = `${overlay.bold ? '\\b1' : '\\b0'}${overlay.italic ? '\\i1' : '\\i0'}`
    const ec = assColor(overlay.effectColor)
    const events: string[] = []

    // Background shape behind everything: a \p vector drawing on layer 0. libass
    // can't measure fonts, so the block is sized from an estimated width (the
    // canvas preview uses real metrics — a small, documented discrepancy).
    if (overlay.background) {
      const pad = Math.max(1, Math.round(size * overlay.boxPadding))
      const lines = overlay.text.split('\n')
      const maxW = Math.max(1, ...lines.map((line) => [...line].length * size * EST_CHAR_W))
      const lineHeight = size * 1.2
      const blockH = Math.round((lines.length - 1) * lineHeight + size)
      const boxW = Math.round(maxW + pad * 2)
      const boxH = blockH + pad * 2
      const boxTop = Math.round(y - blockH / 2 - pad)
      const boxLeft = Math.round(
        overlay.align === 'left' ? x - pad : overlay.align === 'right' ? x - maxW - pad : x - maxW / 2 - pad
      )
      const radiusPx = Math.round(size * overlay.boxRadius)
      const draw = bubbleDrawing(overlay.bubble, boxW, boxH, size, radiusPx)
      events.push(
        `Dialogue: 0,${start},${end},Plain,,0,0,0,,{\\an7\\pos(${boxLeft},${boxTop})\\1c${assColor(overlay.boxColor)}\\1a${assAlpha(overlay.boxOpacity)}\\bord0\\shad0${animTags}\\p1}${draw}`
      )
    }

    // Glyph effect. Directional effects (echo/glitch) burn offset copies as their
    // own layers behind the main text; the rest are inline tag suffixes.
    const off = Math.round(overlay.effectIntensity * size * 0.18)
    const rad = (overlay.effectDirection * Math.PI) / 180
    const ox = Math.round(Math.cos(rad) * off)
    const oy = Math.round(Math.sin(rad) * off)
    const w = Math.max(1, Math.round(size * overlay.effectIntensity * 0.14))
    const layer = (lx: number, ly: number, colorAss: string, alphaAss: string): string =>
      `Dialogue: 1,${start},${end},Plain,,0,0,0,,{\\an${an}\\fn${fontName}\\fs${size}${bi}${frz}${animTags}\\pos(${x + lx},${y + ly})\\1c${colorAss}\\1a${alphaAss}\\bord0\\shad0}${text}`

    let suffix = '\\bord0\\shad0'
    switch (overlay.effect) {
      case 'shadow':
        suffix = `\\bord0\\shad${Math.max(1, Math.round(overlay.effectIntensity * size * 0.15))}\\4c${ec}\\4a${assAlpha(0.85)}`
        break
      case 'lift':
        suffix = `\\bord0\\shad${Math.max(1, Math.round(size * (0.04 + overlay.effectIntensity * 0.06)))}\\4c&H000000&\\4a&H50&`
        break
      case 'outline':
        suffix = `\\bord${Math.max(1, Math.round(size * overlay.effectIntensity * 0.12))}\\3c${ec}\\3a${fillAlpha}\\shad0`
        break
      case 'hollow':
        suffix = `\\1a&HFF&\\bord${w}\\3c${assColor(overlay.color)}\\3a${fillAlpha}\\shad0`
        break
      case 'splice':
        suffix = `\\1a&HFF&\\bord${w}\\3c${assColor(overlay.color)}\\3a${fillAlpha}\\shad${Math.max(1, Math.round(overlay.effectIntensity * size * 0.12))}\\4c${ec}\\4a${assAlpha(0.85)}`
        break
      case 'echo':
        events.push(layer(ox * 2, oy * 2, ec, assAlpha(0.25)))
        events.push(layer(ox, oy, ec, assAlpha(0.45)))
        break
      case 'glitch':
        events.push(layer(ox, oy, '&H3C00FF&', assAlpha(0.85)))
        events.push(layer(-ox, -oy, '&HFFE600&', assAlpha(0.85)))
        break
      case 'neon':
        suffix = `\\bord${Math.max(1, Math.round(size * 0.05))}\\3c${ec}\\3a${fillAlpha}\\blur${Math.max(1, Math.round(overlay.effectIntensity * size * 0.15))}\\shad0`
        break
      default:
        suffix = '\\bord0\\shad0'
    }

    events.push(`Dialogue: 2,${start},${end},Plain,,0,0,0,,{${base}${suffix}}${text}`)
    return events
  })
  return [...HEADER, ...playRes, '', ...STYLES, '', ...EVENTS_FORMAT, ...events, ''].join('\n')
}
