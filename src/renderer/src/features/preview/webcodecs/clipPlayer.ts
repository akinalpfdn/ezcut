import { demux } from './demux'

const MAX_QUEUE = 24
const MAX_DECODE_BACKLOG = 8

/**
 * Single-clip WebCodecs player (Phase 8 foundation): demuxes a file, decodes
 * video frames on demand into a small queue, and draws the frame for the current
 * time onto a canvas. A rAF master clock drives playback; seeking restarts the
 * decoder from the nearest keyframe. VideoFrames are closed promptly to bound memory.
 */
export class WebCodecsClipPlayer {
  private readonly ctx: CanvasRenderingContext2D
  private config: VideoDecoderConfig | null = null
  private decoder: VideoDecoder | null = null
  private chunks: EncodedVideoChunk[] = []
  private keyframeIndices: number[] = []
  private queue: VideoFrame[] = []
  private feedIndex = 0
  private durationUs = 0
  private currentUs = 0
  private playing = false
  private rafId: number | null = null
  private lastTs: number | null = null

  onTime?: (seconds: number) => void

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
  }

  get durationSeconds(): number {
    return this.durationUs / 1_000_000
  }

  async load(fileUrl: string): Promise<void> {
    const result = await demux(fileUrl)
    if (!result.video) throw new Error('No decodable video track')
    this.chunks = result.video.chunks
    this.config = result.video.config
    this.durationUs = result.durationSeconds * 1_000_000
    this.keyframeIndices = []
    this.chunks.forEach((chunk, index) => {
      if (chunk.type === 'key') this.keyframeIndices.push(index)
    })
    this.resetDecoder()
    this.seek(0)
  }

  private resetDecoder(): void {
    if (this.decoder) {
      try {
        this.decoder.close()
      } catch {
        // already closed
      }
    }
    for (const frame of this.queue) frame.close()
    this.queue = []
    this.decoder = new VideoDecoder({
      output: (frame) => this.onFrame(frame),
      error: (error) => console.error('[webcodecs] decode error', error)
    })
    if (this.config) this.decoder.configure(this.config)
  }

  private pump(): void {
    const decoder = this.decoder
    if (!decoder) return
    while (
      this.queue.length < MAX_QUEUE &&
      this.feedIndex < this.chunks.length &&
      decoder.decodeQueueSize < MAX_DECODE_BACKLOG
    ) {
      const chunk = this.chunks[this.feedIndex]
      this.feedIndex += 1
      if (chunk) decoder.decode(chunk)
    }
  }

  private onFrame(frame: VideoFrame): void {
    this.queue.push(frame)
    this.queue.sort((a, b) => a.timestamp - b.timestamp)
    this.renderCurrent()
    this.pump()
  }

  private renderCurrent(): void {
    let best = -1
    for (let i = 0; i < this.queue.length; i += 1) {
      const f = this.queue[i]
      if (f && f.timestamp <= this.currentUs) best = i
      else break
    }

    if (best > 0) {
      for (let i = 0; i < best; i += 1) this.queue[i]?.close()
      this.queue.splice(0, best)
    }

    // queue[0] is now the frame for currentUs, or the earliest available frame
    // (an approximation right after a seek, before the exact frame is decoded).
    const frame = this.queue[0]
    if (frame) this.draw(frame)
  }

  private draw(frame: VideoFrame): void {
    if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
      this.canvas.width = frame.displayWidth
      this.canvas.height = frame.displayHeight
    }
    this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height)
  }

  private loop = (ts: number): void => {
    if (!this.playing) return
    const delta = this.lastTs === null ? 0 : ts - this.lastTs
    this.lastTs = ts
    this.currentUs = Math.min(this.currentUs + delta * 1000, this.durationUs)
    this.pump()
    this.renderCurrent()
    this.onTime?.(this.currentUs / 1_000_000)
    if (this.currentUs >= this.durationUs) {
      this.playing = false
      return
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  play(): void {
    if (this.playing || !this.decoder) return
    this.playing = true
    this.lastTs = null
    this.rafId = requestAnimationFrame(this.loop)
  }

  pause(): void {
    this.playing = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  seek(seconds: number): void {
    const targetUs = Math.min(Math.max(seconds * 1_000_000, 0), this.durationUs)
    this.currentUs = targetUs

    let keyframe = 0
    for (const index of this.keyframeIndices) {
      const chunk = this.chunks[index]
      if (chunk && chunk.timestamp <= targetUs) keyframe = index
      else break
    }

    this.resetDecoder()
    this.feedIndex = keyframe
    this.pump()
    this.onTime?.(targetUs / 1_000_000)
  }

  dispose(): void {
    this.pause()
    if (this.decoder) {
      try {
        this.decoder.close()
      } catch {
        // already closed
      }
      this.decoder = null
    }
    for (const frame of this.queue) frame.close()
    this.queue = []
  }
}
