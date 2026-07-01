import type { BubbleShape, FontFamily, TextAlign, TextEffect, TransitionType } from '@shared'
import { ClipVideoSource } from './clipVideoSource'

/** Scale + pan of a clip within the composition (1 = contain-fit, 0 = centred). */
interface Transform {
  scale: number
  posX: number
  posY: number
}

/** A clip to draw/prefetch: the resolved decode url (proxy or original) + the
 * source time to show. Clip selection + proxy resolution happen on the main
 * thread; this worker only demuxes, decodes, and draws. */
interface ClipRef {
  clipId: string
  fileUrl: string
  sourceUs: number
}

/** The incoming clip of a transition, drawn on top of the active clip. `progress`
 * ramps 0→1 across the overlap (drives alpha for crossfade, offset for slides). */
interface TransitionRef extends ClipRef {
  transitionType: TransitionType
  progress: number
  transform: Transform
}

/** A text overlay to draw on top of the frame (position/size normalized to the frame). */
interface TextDraw {
  text: string
  x: number
  y: number
  fontSize: number
  color: string
  fillType: 'solid' | 'linear' | 'radial'
  gradientFrom: string
  gradientTo: string
  gradientAngle: number
  background: boolean
  bubble: BubbleShape
  fontFamily: FontFamily
  align: TextAlign
  bold: boolean
  italic: boolean
  effect: TextEffect
  effectColor: string
  effectIntensity: number
  effectDirection: number
  boxColor: string
  boxOpacity: number
  boxRadius: number
  boxPadding: number
  opacity: number
  rotation: number
  glow: boolean
  glowColor: string
  glowStrength: number
  animAlpha: number
  animDx: number
  animDy: number
  animScale: number
  animReveal: number
}

/** Maps a font family to a canvas font token: a generic keyword for the presets,
 * else the system family name quoted (so multi-word names parse). */
function cssFontFamily(family: FontFamily): string {
  if (family === 'sans') return 'sans-serif'
  if (family === 'serif') return 'serif'
  if (family === 'mono') return 'monospace'
  return `"${family.replace(/"/g, '')}"`
}

/** #RRGGBB + alpha → canvas rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').padEnd(6, '0')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Fill style for a text line: a solid colour or a gradient across its bounding box. */
function lineFill(
  c: OffscreenCanvasRenderingContext2D,
  overlay: TextDraw,
  left: number,
  cy: number,
  lineW: number,
  size: number
): string | CanvasGradient {
  if (overlay.fillType === 'solid') return hexToRgba(overlay.color, overlay.opacity)
  const from = hexToRgba(overlay.gradientFrom, overlay.opacity)
  const to = hexToRgba(overlay.gradientTo, overlay.opacity)
  const cx = left + lineW / 2
  if (overlay.fillType === 'radial') {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(lineW, size) / 2)
    g.addColorStop(0, from)
    g.addColorStop(1, to)
    return g
  }
  const rad = (overlay.gradientAngle * Math.PI) / 180
  const r = Math.max(lineW, size) / 2
  const g = c.createLinearGradient(cx - Math.cos(rad) * r, cy - Math.sin(rad) * r, cx + Math.cos(rad) * r, cy + Math.sin(rad) * r)
  g.addColorStop(0, from)
  g.addColorStop(1, to)
  return g
}

interface InitMessage {
  type: 'init'
  canvas: OffscreenCanvas
}

interface RenderMessage {
  type: 'render'
  /** Composition (output frame) size, derived from the project aspect ratio. */
  comp: { width: number; height: number }
  /** Scale/pan of the active clip (also used for an image fallback). */
  activeTransform: Transform
  hasActiveClip: boolean
  active: ClipRef | null
  next: ClipRef | null
  /** Incoming clip blended over the active one during a crossfade overlap. */
  transition: TransitionRef | null
  /** Text overlays active at the current time, drawn on top of everything. */
  texts: TextDraw[]
  /** Thumbnail to show until the active clip's first frame decodes (or while its
   * proxy is still generating, when `active` is null). */
  fallbackUrl: string | null
}

type IncomingMessage = InitMessage | RenderMessage

/** Cap on retained fallback thumbnails (one per media); evicted LRU + closed. */
const MAX_THUMBNAILS = 24

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
// The video is composited onto this offscreen "base" layer (no text). Each render
// the base is blitted to the visible canvas and text is drawn on top — so moving a
// text overlay while paused can never accumulate (ghost) over a stale frame.
let baseCanvas: OffscreenCanvas | null = null
let baseCtx: OffscreenCanvasRenderingContext2D | null = null
let postedWidth = 0
let postedHeight = 0
const sources = new Map<string, ClipVideoSource>()

/** Tells the main thread the current frame dimensions so it can map preview pointer
 * coordinates (which include object-fit letterboxing) onto the frame for text drags. */
function notifySize(): void {
  if (!baseCanvas || (baseCanvas.width === postedWidth && baseCanvas.height === postedHeight)) return
  postedWidth = baseCanvas.width
  postedHeight = baseCanvas.height
  self.postMessage({ type: 'size', width: baseCanvas.width, height: baseCanvas.height })
}
const loading = new Set<string>()
const thumbnails = new Map<string, ImageBitmap>()
const thumbnailLoading = new Set<string>()

function ensureSource(clipId: string, fileUrl: string): ClipVideoSource | null {
  const existing = sources.get(clipId)
  if (existing) return existing
  if (loading.has(clipId)) return null
  loading.add(clipId)
  const source = new ClipVideoSource()
  source
    .load(fileUrl)
    .then(() => {
      sources.set(clipId, source)
      loading.delete(clipId)
    })
    .catch((error) => {
      console.error('[worker] clip load failed', clipId, error)
      loading.delete(clipId)
      source.dispose()
    })
  return null
}

function ensureThumbnail(url: string): ImageBitmap | null {
  const cached = thumbnails.get(url)
  if (cached) {
    thumbnails.delete(url)
    thumbnails.set(url, cached) // bump to most-recently-used
    return cached
  }
  if (thumbnailLoading.has(url)) return null
  thumbnailLoading.add(url)
  void fetch(url)
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      thumbnails.set(url, bitmap)
      thumbnailLoading.delete(url)
      while (thumbnails.size > MAX_THUMBNAILS) {
        const oldest = thumbnails.keys().next().value as string
        thumbnails.get(oldest)?.close()
        thumbnails.delete(oldest)
      }
    })
    .catch(() => thumbnailLoading.delete(url))
  return null
}

/** Resizes the base canvas to the composition (output) size. */
function setComposition(width: number, height: number): void {
  if (!baseCanvas) return
  if (baseCanvas.width !== width || baseCanvas.height !== height) {
    baseCanvas.width = width
    baseCanvas.height = height
  }
  notifySize()
}

/** Contain-fit rect of a source (srcW×srcH) within the composition, then scaled +
 * panned by the clip transform. */
function containRect(srcW: number, srcH: number, t: Transform): { dx: number; dy: number; dw: number; dh: number } {
  const cw = baseCanvas?.width ?? srcW
  const ch = baseCanvas?.height ?? srcH
  const fit = Math.min(cw / srcW, ch / srcH)
  const dw = srcW * fit * t.scale
  const dh = srcH * fit * t.scale
  return { dx: (cw - dw) / 2 + t.posX * cw, dy: (ch - dh) / 2 + t.posY * ch, dw, dh }
}

/** Clears to black (letterbox), then draws the source contain-fit + transformed. */
function drawSource(src: CanvasImageSource, srcW: number, srcH: number, t: Transform): void {
  if (!baseCanvas || !baseCtx) return
  baseCtx.fillStyle = '#000000'
  baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height)
  const r = containRect(srcW, srcH, t)
  baseCtx.drawImage(src, r.dx, r.dy, r.dw, r.dh)
}

function clear(): void {
  if (!baseCanvas || !baseCtx) return
  baseCtx.fillStyle = '#000000'
  baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height)
  notifySize()
}

function drawFrame(frame: VideoFrame, t: Transform): void {
  drawSource(frame, frame.displayWidth, frame.displayHeight, t)
  notifySize()
}

/** Draws the incoming transition clip over the active one, contain-fit + transformed.
 * Mirrors the ffmpeg xfade families: crossfade=alpha, slide=offset, zoom=scale,
 * wipe=rect clip, circle=circle clip. Offsets span the whole composition. */
function drawTransition(frame: VideoFrame, type: TransitionType, progress: number, t: Transform): void {
  if (!baseCanvas || !baseCtx) return
  const c = baseCtx
  const w = baseCanvas.width
  const h = baseCanvas.height
  const p = Math.max(0, Math.min(1, progress))
  const r = containRect(frame.displayWidth, frame.displayHeight, t)
  const blit = (offX: number, offY: number): void => c.drawImage(frame, r.dx + offX, r.dy + offY, r.dw, r.dh)
  const clipRect = (x: number, y: number, rw: number, rh: number): void => {
    c.save()
    c.beginPath()
    c.rect(x, y, rw, rh)
    c.clip()
    blit(0, 0)
    c.restore()
  }

  switch (type) {
    case 'crossfade':
      c.globalAlpha = p
      blit(0, 0)
      c.globalAlpha = 1
      return
    case 'slideLeft':
      blit(w * (1 - p), 0)
      return
    case 'slideRight':
      blit(-w * (1 - p), 0)
      return
    case 'slideUp':
      blit(0, h * (1 - p))
      return
    case 'slideDown':
      blit(0, -h * (1 - p))
      return
    case 'zoomIn':
      c.globalAlpha = p
      c.drawImage(frame, r.dx + (r.dw * (1 - p)) / 2, r.dy + (r.dh * (1 - p)) / 2, r.dw * p, r.dh * p)
      c.globalAlpha = 1
      return
    case 'wipeLeft':
      clipRect(0, 0, w * p, h)
      return
    case 'wipeRight':
      clipRect(w * (1 - p), 0, w * p, h)
      return
    case 'wipeUp':
      clipRect(0, 0, w, h * p)
      return
    case 'wipeDown':
      clipRect(0, h * (1 - p), w, h * p)
      return
    case 'circleOpen':
      c.save()
      c.beginPath()
      c.arc(w / 2, h / 2, (Math.hypot(w, h) / 2) * p, 0, Math.PI * 2)
      c.clip()
      blit(0, 0)
      c.restore()
      return
    case 'circleClose':
      c.save()
      c.beginPath()
      c.rect(0, 0, w, h)
      c.arc(w / 2, h / 2, (Math.hypot(w, h) / 2) * (1 - p), 0, Math.PI * 2, true)
      c.clip('evenodd')
      blit(0, 0)
      c.restore()
      return
  }
}

function drawThumbnail(url: string, t: Transform): void {
  const bitmap = ensureThumbnail(url)
  if (!bitmap) return // not ready yet — keep the last drawn content
  drawSource(bitmap, bitmap.width, bitmap.height, t)
  notifySize()
}

/** Draws text overlays on top of the current canvas (positions/size are fractions
 * of the frame, so they scale with resolution). */
/** Traces the bubble shape into the current path and fills it (caller sets
 * fillStyle). Coordinates are the padded background box (x,y,w,h); `size` is the
 * font size (drives tail/notch proportions). Mirrors the ASS export shapes. */
function drawBubbleShape(
  c: OffscreenCanvasRenderingContext2D,
  shape: BubbleShape,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  radius: number
): void {
  c.beginPath()
  switch (shape) {
    case 'pill':
      c.roundRect(x, y, w, h, h / 2)
      break
    case 'tape': {
      // Parallelogram — slanted left/right edges (washi-tape look).
      const s = h * 0.35
      c.moveTo(x + s, y)
      c.lineTo(x + w, y)
      c.lineTo(x + w - s, y + h)
      c.lineTo(x, y + h)
      c.closePath()
      break
    }
    case 'banner': {
      // Ribbon with V-notched ends.
      const n = h * 0.4
      c.moveTo(x, y)
      c.lineTo(x + w, y)
      c.lineTo(x + w - n, y + h / 2)
      c.lineTo(x + w, y + h)
      c.lineTo(x, y + h)
      c.lineTo(x + n, y + h / 2)
      c.closePath()
      break
    }
    case 'speech': {
      // Rounded rect + a downward tail near the lower-left.
      const r = Math.min(size * 0.35, h / 2, w / 2)
      c.roundRect(x, y, w, h, r)
      c.moveTo(x + w * 0.22, y + h)
      c.lineTo(x + w * 0.4, y + h)
      c.lineTo(x + w * 0.26, y + h + size * 0.4)
      c.closePath()
      break
    }
    case 'bar':
      // Highlighter bar over the lower portion of the text.
      c.rect(x, y + h * 0.52, w, h * 0.42)
      break
    case 'rounded':
    default:
      c.roundRect(x, y, w, h, Math.min(size * radius, w / 2, h / 2))
      break
  }
  c.fill()
}

function drawTexts(texts: TextDraw[]): void {
  if (!canvas || !ctx || texts.length === 0) return
  const c = ctx
  const width = canvas.width
  const height = canvas.height
  c.textBaseline = 'middle'
  for (const overlay of texts) {
    const lines = overlay.text.split('\n')
    const size = Math.max(1, overlay.fontSize * height)
    const lineHeight = size * 1.2
    const anchorX = overlay.x * width
    const anchorY = overlay.y * height

    c.save()
    c.globalAlpha = overlay.animAlpha
    // Slide (global) then rotate + scale about the anchor.
    c.translate(overlay.animDx * height, overlay.animDy * height)
    c.translate(anchorX, anchorY)
    if (overlay.rotation) c.rotate((overlay.rotation * Math.PI) / 180)
    if (overlay.animScale !== 1) c.scale(overlay.animScale, overlay.animScale)
    c.translate(-anchorX, -anchorY)
    c.font = `${overlay.italic ? 'italic ' : ''}${overlay.bold ? 'bold' : 'normal'} ${size}px ${cssFontFamily(overlay.fontFamily)}`
    c.textAlign = overlay.align
    c.lineJoin = 'round'
    const firstCenterY = anchorY - ((lines.length - 1) / 2) * lineHeight
    // Whole-block background shape: drawn once behind all lines (measured from the
    // full text so it stays stable while a typewriter reveal types in).
    if (overlay.background) {
      let maxW = 1
      for (const l of lines) maxW = Math.max(maxW, c.measureText(l).width)
      const pad = size * overlay.boxPadding
      const boxLeft =
        overlay.align === 'left'
          ? anchorX - pad
          : overlay.align === 'right'
            ? anchorX - maxW - pad
            : anchorX - maxW / 2 - pad
      const boxW = maxW + pad * 2
      const boxTop = firstCenterY - size / 2 - pad
      const boxH = (lines.length - 1) * lineHeight + size + pad * 2
      c.fillStyle = hexToRgba(overlay.boxColor, overlay.boxOpacity)
      drawBubbleShape(c, overlay.bubble, boxLeft, boxTop, boxW, boxH, size, overlay.boxRadius)
    }
    // Typewriter: reveal a growing prefix of the whole text across the lines.
    let charBudget =
      overlay.animReveal < 1
        ? Math.ceil(overlay.animReveal * lines.reduce((sum, l) => sum + l.length, 0))
        : Number.POSITIVE_INFINITY
    for (let i = 0; i < lines.length; i += 1) {
      const fullLine = lines[i] ?? ''
      const line = charBudget === Number.POSITIVE_INFINITY ? fullLine : fullLine.slice(0, Math.max(0, charBudget))
      charBudget -= fullLine.length
      const cy = firstCenterY + i * lineHeight
      const lineW = c.measureText(line).width
      const textLeft =
        overlay.align === 'left' ? anchorX : overlay.align === 'right' ? anchorX - lineW : anchorX - lineW / 2
      const fill = lineFill(c, overlay, textLeft, cy, lineW, size)
      const clearShadow = (): void => {
        c.shadowColor = 'transparent'
        c.shadowBlur = 0
        c.shadowOffsetX = 0
        c.shadowOffsetY = 0
      }
      const rad = (overlay.effectDirection * Math.PI) / 180
      const off = overlay.effectIntensity * size * 0.18
      const ox = Math.cos(rad) * off
      const oy = Math.sin(rad) * off
      const ec = (a: number): string => hexToRgba(overlay.effectColor, overlay.opacity * a)
      const stroke = (style: string | CanvasGradient, w: number): void => {
        c.lineWidth = w
        c.strokeStyle = style
        c.strokeText(line, anchorX, cy)
      }
      switch (overlay.effect) {
        case 'shadow':
          c.shadowColor = ec(0.85)
          c.shadowBlur = overlay.effectIntensity * size * 0.25
          c.shadowOffsetX = ox
          c.shadowOffsetY = oy
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
          clearShadow()
          break
        case 'lift':
          c.shadowColor = 'rgba(0, 0, 0, 0.35)'
          c.shadowBlur = size * (0.12 + overlay.effectIntensity * 0.2)
          c.shadowOffsetY = size * 0.04
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
          clearShadow()
          break
        case 'outline':
          stroke(ec(1), Math.max(1, size * overlay.effectIntensity * 0.18))
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
          break
        case 'hollow':
          stroke(fill, Math.max(1, size * Math.max(0.06, overlay.effectIntensity * 0.14)))
          break
        case 'splice':
          c.fillStyle = ec(1)
          c.fillText(line, anchorX + ox, cy + oy)
          stroke(fill, Math.max(1, size * Math.max(0.05, overlay.effectIntensity * 0.12)))
          break
        case 'echo':
          c.fillStyle = ec(0.25)
          c.fillText(line, anchorX + ox * 2, cy + oy * 2)
          c.fillStyle = ec(0.45)
          c.fillText(line, anchorX + ox, cy + oy)
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
          break
        case 'glitch':
          c.fillStyle = `rgba(255, 0, 60, ${overlay.opacity * 0.85})`
          c.fillText(line, anchorX + ox, cy + oy)
          c.fillStyle = `rgba(0, 230, 255, ${overlay.opacity * 0.85})`
          c.fillText(line, anchorX - ox, cy - oy)
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
          break
        case 'neon':
          c.shadowColor = hexToRgba(overlay.effectColor, 1)
          c.shadowBlur = Math.max(2, overlay.effectIntensity * size * 0.9)
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
          c.fillText(line, anchorX, cy)
          clearShadow()
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
          break
        default:
          c.fillStyle = fill
          c.fillText(line, anchorX, cy)
      }
    }
    c.restore()
  }
}

function handleRender(message: RenderMessage): void {
  const keep = new Set<string>()
  setComposition(message.comp.width, message.comp.height)
  const activeTransform = message.activeTransform

  if (!message.hasActiveClip) {
    clear()
  } else {
    if (message.active) {
      keep.add(message.active.clipId)
      const source = ensureSource(message.active.clipId, message.active.fileUrl)
      const frame = source?.isLoaded ? source.frameAt(message.active.sourceUs) : null
      if (frame) {
        drawFrame(frame, activeTransform)
      } else if ((!source || !source.isLoaded) && message.fallbackUrl) {
        // Initial load / proxy still generating — show the thumbnail (a brief
        // mid-playback decode gap instead keeps the last frame, no flash).
        drawThumbnail(message.fallbackUrl, activeTransform)
      }
    } else if (message.fallbackUrl) {
      drawThumbnail(message.fallbackUrl, activeTransform)
    } else {
      // Active clip whose media/url can't be resolved (a dangling reference in a
      // loaded project, or a proxy still generating with no thumbnail) — clear
      // rather than leave a stale frame from the previous clip on screen.
      clear()
    }

    // Transition: draw the incoming clip over the active one (alpha or slide).
    if (message.transition) {
      keep.add(message.transition.clipId)
      const source = ensureSource(message.transition.clipId, message.transition.fileUrl)
      const frame = source?.isLoaded ? source.frameAt(message.transition.sourceUs) : null
      if (frame) {
        drawTransition(frame, message.transition.transitionType, message.transition.progress, message.transition.transform)
      }
    }

    if (message.next) {
      keep.add(message.next.clipId)
      const source = ensureSource(message.next.clipId, message.next.fileUrl)
      if (source?.isLoaded) source.prefetch(message.next.sourceUs)
    }
  }

  // Blit the freshly-composited base onto the visible canvas, then draw text on
  // top. The base is rebuilt every render, so text never accumulates over a stale
  // frame (the ghosting seen when dragging a text overlay while paused).
  if (canvas && ctx && baseCanvas) {
    if (canvas.width !== baseCanvas.width || canvas.height !== baseCanvas.height) {
      canvas.width = baseCanvas.width
      canvas.height = baseCanvas.height
    }
    ctx.drawImage(baseCanvas, 0, 0)
  }

  drawTexts(message.texts)

  // Bounded memory: only the active + next sources hold decoded frames; dispose
  // the rest (their demuxed chunks stay cached, so revisiting is still cheap —
  // no re-fetch/re-parse, just a quick re-seek).
  for (const [clipId, source] of sources) {
    if (!keep.has(clipId)) {
      source.dispose()
      sources.delete(clipId)
    }
  }
}

self.onmessage = (event: MessageEvent<IncomingMessage>): void => {
  const data = event.data
  if (data.type === 'init') {
    canvas = data.canvas
    ctx = canvas.getContext('2d')
    baseCanvas = new OffscreenCanvas(canvas.width, canvas.height)
    baseCtx = baseCanvas.getContext('2d')
  } else if (data.type === 'render') {
    handleRender(data)
  }
}
