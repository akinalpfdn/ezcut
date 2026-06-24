/** Structured media metadata produced by the main-process probe service. */

export type StreamKind = 'video' | 'audio' | 'subtitle' | 'data'

export interface MediaStreamInfo {
  index: number
  kind: StreamKind
  codecName: string
  /** Video only. */
  width?: number
  /** Video only. */
  height?: number
  /** Video only, frames per second (parsed from r_frame_rate). */
  fps?: number
  /** Audio only. */
  sampleRate?: number
  /** Audio only. */
  channels?: number
}

export interface MediaProbeResult {
  path: string
  formatName: string
  durationSeconds: number
  sizeBytes: number
  bitRate?: number
  streams: MediaStreamInfo[]
  hasVideo: boolean
  hasAudio: boolean
  /** Convenience: first video stream dimensions/fps, if any. */
  width?: number
  height?: number
  fps?: number
}

/** Versions + resolved binary paths, used to verify packaged-build execution. */
export interface MediaToolingInfo {
  ffmpegVersion: string
  ffprobeVersion: string
  ffmpegPath: string
  ffprobePath: string
}

export type MediaKind = 'video' | 'audio' | 'image'

/** Downsampled audio envelope for waveform rendering: one normalized 0..1 peak
 * magnitude per bucket. */
export interface WaveformData {
  peaks: number[]
  bucketCount: number
}

/** Progress of a preview-proxy transcode, emitted from main while it runs. */
export interface ProxyProgress {
  mediaPath: string
  ratio: number
}

/** A library item: a probed source file plus its derived display assets.
 * The single source of truth for imported media; the timeline references these
 * by id (Phase 3+). */
export interface MediaItem {
  id: string
  path: string
  name: string
  kind: MediaKind
  durationSeconds: number
  sizeBytes: number
  hasVideo: boolean
  hasAudio: boolean
  width?: number
  height?: number
  fps?: number
  /** Video: absolute path to a generated thumbnail frame (served via ezmedia://). */
  thumbnailPath?: string
  /** Audio: downsampled waveform peaks. */
  waveform?: WaveformData
  /** Video: true when preview decode needs a transcoded proxy (non-mp4/oversized/
   * unsupported codec). Export still uses the original source. */
  needsProxy?: boolean
}
