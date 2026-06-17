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
