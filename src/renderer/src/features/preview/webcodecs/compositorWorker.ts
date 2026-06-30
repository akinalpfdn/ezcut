import type { FontFamily, TextAlign, TransitionType } from '@shared'
import { ClipVideoSource } from './clipVideoSource'

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
  fontFamily: FontFamily
  align: TextAlign
  bold: boolean
  italic: boolean
  outlineColor: string
  outlineWidth: number
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

function clear(): void {
  if (!baseCanvas || !baseCtx) return
  baseCtx.fillStyle = '#000000'
  baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height)
  notifySize()
}

function drawFrame(frame: VideoFrame): void {
  if (!baseCanvas || !baseCtx) return
  if (baseCanvas.width !== frame.displayWidth || baseCanvas.height !== frame.displayHeight) {
    baseCanvas.width = frame.displayWidth
    baseCanvas.height = frame.displayHeight
  }
  baseCtx.drawImage(frame, 0, 0, baseCanvas.width, baseCanvas.height)
  notifySize()
}

/** Draws the incoming transition frame over the current canvas (what the active
 * clip already drew) WITHOUT resizing. Mirrors the families ffmpeg xfade exports:
 * crossfade=alpha, slide=offset, zoom=scale, wipe=rect clip, circle=circle clip. */
function drawTransition(frame: VideoFrame, type: TransitionType, progress: number): void {
  if (!baseCanvas || !baseCtx) return
  const c = baseCtx
  const w = baseCanvas.width
  const h = baseCanvas.height
  const p = Math.max(0, Math.min(1, progress))

  const clipRect = (x: number, y: number, rw: number, rh: number): void => {
    c.save()
    c.beginPath()
    c.rect(x, y, rw, rh)
    c.clip()
    c.drawImage(frame, 0, 0, w, h)
    c.restore()
  }

  switch (type) {
    case 'crossfade':
      c.globalAlpha = p
      c.drawImage(frame, 0, 0, w, h)
      c.globalAlpha = 1
      return
    case 'slideLeft':
      c.drawImage(frame, w * (1 - p), 0, w, h)
      return
    case 'slideRight':
      c.drawImage(frame, -w * (1 - p), 0, w, h)
      return
    case 'slideUp':
      c.drawImage(frame, 0, h * (1 - p), w, h)
      return
    case 'slideDown':
      c.drawImage(frame, 0, -h * (1 - p), w, h)
      return
    case 'zoomIn':
      c.globalAlpha = p
      c.drawImage(frame, (w - w * p) / 2, (h - h * p) / 2, w * p, h * p)
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
      c.drawImage(frame, 0, 0, w, h)
      c.restore()
      return
    case 'circleClose':
      c.save()
      c.beginPath()
      c.rect(0, 0, w, h)
      c.arc(w / 2, h / 2, (Math.hypot(w, h) / 2) * (1 - p), 0, Math.PI * 2, true)
      c.clip('evenodd')
      c.drawImage(frame, 0, 0, w, h)
      c.restore()
      return
  }
}

function drawThumbnail(url: string): void {
  if (!baseCanvas || !baseCtx) return
  const bitmap = ensureThumbnail(url)
  if (!bitmap) return // not ready yet — keep the last drawn content
  if (baseCanvas.width !== bitmap.width || baseCanvas.height !== bitmap.height) {
    baseCanvas.width = bitmap.width
    baseCanvas.height = bitmap.height
  }
  baseCtx.drawImage(bitmap, 0, 0, baseCanvas.width, baseCanvas.height)
  notifySize()
}

/** Draws text overlays on top of the current canvas (positions/size are fractions
 * of the frame, so they scale with resolution). */
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
      if (overlay.background && line.length > 0) {
        const pad = size * overlay.boxPadding
        const boxLeft =
          overlay.align === 'left'
            ? anchorX - pad
            : overlay.align === 'right'
              ? anchorX - lineW - pad
              : anchorX - lineW / 2 - pad
        const boxW = lineW + pad * 2
        const boxH = size + pad * 2
        const radius = Math.min(size * overlay.boxRadius, boxW / 2, boxH / 2)
        c.fillStyle = hexToRgba(overlay.boxColor, overlay.boxOpacity)
        c.beginPath()
        c.roundRect(boxLeft, cy - boxH / 2, boxW, boxH, radius)
        c.fill()
      }
      const setShadow = (): void => {
        c.shadowColor = 'rgba(0, 0, 0, 0.7)'
        c.shadowBlur = size * 0.08
        c.shadowOffsetY = size * 0.03
      }
      const clearShadow = (): void => {
        c.shadowColor = 'transparent'
        c.shadowBlur = 0
        c.shadowOffsetY = 0
      }
      if (overlay.glow) {
        // Neon: bright blurred copies build the glow, then a crisp fill on top.
        c.shadowColor = hexToRgba(overlay.glowColor, 1)
        c.shadowBlur = Math.max(2, overlay.glowStrength * size * 0.8)
        c.shadowOffsetX = 0
        c.shadowOffsetY = 0
        c.fillStyle = fill
        c.fillText(line, anchorX, cy)
        c.fillText(line, anchorX, cy)
        c.shadowColor = 'transparent'
        c.shadowBlur = 0
        c.fillText(line, anchorX, cy)
      } else if (overlay.outlineWidth > 0) {
        // Outline casts the shadow, then the fill draws clean on top.
        setShadow()
        c.lineWidth = size * overlay.outlineWidth * 2
        c.strokeStyle = hexToRgba(overlay.outlineColor, overlay.opacity)
        c.strokeText(line, anchorX, cy)
        clearShadow()
        c.fillStyle = fill
        c.fillText(line, anchorX, cy)
      } else {
        setShadow()
        c.fillStyle = fill
        c.fillText(line, anchorX, cy)
        clearShadow()
      }
    }
    c.restore()
  }
}

function handleRender(message: RenderMessage): void {
  const keep = new Set<string>()

  if (!message.hasActiveClip) {
    clear()
  } else {
    if (message.active) {
      keep.add(message.active.clipId)
      const source = ensureSource(message.active.clipId, message.active.fileUrl)
      const frame = source?.isLoaded ? source.frameAt(message.active.sourceUs) : null
      if (frame) {
        drawFrame(frame)
      } else if ((!source || !source.isLoaded) && message.fallbackUrl) {
        // Initial load / proxy still generating — show the thumbnail (a brief
        // mid-playback decode gap instead keeps the last frame, no flash).
        drawThumbnail(message.fallbackUrl)
      }
    } else if (message.fallbackUrl) {
      drawThumbnail(message.fallbackUrl)
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
      if (frame) drawTransition(frame, message.transition.transitionType, message.transition.progress)
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
