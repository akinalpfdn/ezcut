import { demux } from './demux'

const MAX_QUEUE = 24
const MAX_DECODE_BACKLOG = 8
/** If the requested time is more than this ahead of the buffer, seek instead of
 * pumping forward (the buffer can't realistically catch up by decoding). */
const FORWARD_SEEK_THRESHOLD_US = 4_000_000

/**
 * A decoded-frame provider for ONE clip's source media. The compositor asks it
 * for the frame at a given source time; it decodes on demand, keeps a small
 * forward buffer, and seeks from the nearest keyframe on jumps. It owns its
 * VideoFrames and closes them as the playhead advances.
 */
export class ClipVideoSource {
  private config: VideoDecoderConfig | null = null
  private decoder: VideoDecoder | null = null
  private chunks: EncodedVideoChunk[] = []
  private keyframeIndices: number[] = []
  private queue: VideoFrame[] = []
  private feedIndex = 0
  private loaded = false
  durationUs = 0

  get isLoaded(): boolean {
    return this.loaded
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
    this.loaded = true
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
    this.feedIndex = 0
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.queue.push(frame)
        this.queue.sort((a, b) => a.timestamp - b.timestamp)
        this.pump()
      },
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

  private keyframeIndexAt(timeUs: number): number {
    let keyframe = 0
    for (const index of this.keyframeIndices) {
      const chunk = this.chunks[index]
      if (chunk && chunk.timestamp <= timeUs) keyframe = index
      else break
    }
    return keyframe
  }

  private seekTo(timeUs: number): void {
    this.resetDecoder()
    this.feedIndex = this.keyframeIndexAt(timeUs)
    this.pump()
  }

  /** Primes decoding around a source time without necessarily drawing (used to
   * decode-ahead the next clip before the boundary). */
  prefetch(timeUs: number): void {
    if (!this.loaded) return
    if (this.queue.length === 0) this.seekTo(timeUs)
    else this.pump()
  }

  /** Returns the frame to display for `timeUs` (or the closest available), seeking
   * if the request is behind or far ahead of the buffer. Caller draws it; the
   * source retains ownership. */
  frameAt(timeUs: number): VideoFrame | null {
    if (!this.decoder) return null

    const earliest = this.queue[0]?.timestamp
    const latest = this.queue[this.queue.length - 1]?.timestamp
    if (this.queue.length === 0) {
      this.seekTo(timeUs)
    } else if (earliest !== undefined && timeUs < earliest - 1000) {
      this.seekTo(timeUs)
    } else if (latest !== undefined && timeUs > latest + FORWARD_SEEK_THRESHOLD_US) {
      this.seekTo(timeUs)
    } else {
      this.pump()
    }

    let best = -1
    for (let i = 0; i < this.queue.length; i += 1) {
      const frame = this.queue[i]
      if (frame && frame.timestamp <= timeUs) best = i
      else break
    }
    if (best > 0) {
      for (let i = 0; i < best; i += 1) this.queue[i]?.close()
      this.queue.splice(0, best)
    }
    return this.queue[0] ?? null
  }

  dispose(): void {
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
    this.loaded = false
  }
}
