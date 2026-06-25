import type { TransitionType } from '@shared'
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
const sources = new Map<string, ClipVideoSource>()
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
  if (!canvas || !ctx) return
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function drawFrame(frame: VideoFrame): void {
  if (!canvas || !ctx) return
  if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
    canvas.width = frame.displayWidth
    canvas.height = frame.displayHeight
  }
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
}

/** Draws the incoming transition frame over the current canvas (what the active
 * clip already drew) WITHOUT resizing. Mirrors the families ffmpeg xfade exports:
 * crossfade=alpha, slide=offset, zoom=scale, wipe=rect clip, circle=circle clip. */
function drawTransition(frame: VideoFrame, type: TransitionType, progress: number): void {
  if (!canvas || !ctx) return
  const c = ctx
  const w = canvas.width
  const h = canvas.height
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
  if (!canvas || !ctx) return
  const bitmap = ensureThumbnail(url)
  if (!bitmap) return // not ready yet — keep the last drawn content
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width
    canvas.height = bitmap.height
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
}

/** Draws text overlays on top of the current canvas (positions/size are fractions
 * of the frame, so they scale with resolution). */
function drawTexts(texts: TextDraw[]): void {
  if (!canvas || !ctx || texts.length === 0) return
  const width = canvas.width
  const height = canvas.height
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const overlay of texts) {
    const size = Math.max(1, overlay.fontSize * height)
    ctx.font = `bold ${size}px sans-serif`
    ctx.fillStyle = overlay.color
    ctx.fillText(overlay.text, overlay.x * width, overlay.y * height)
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
  } else if (data.type === 'render') {
    handleRender(data)
  }
}
