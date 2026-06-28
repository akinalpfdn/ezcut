import type { TimelineModel } from '../timeline/types'
import type { MediaItem } from '../media/types'

export type ExportContainer = 'mp4' | 'mov' | 'webm'
export type QualityPreset = 'high' | 'medium' | 'low'
/** H.265 is ~half the size of H.264 at similar quality (mp4/mov only; webm = VP9). */
export type ExportCodec = 'h264' | 'h265'

export interface ExportOptions {
  container: ExportContainer
  codec: ExportCodec
  width: number
  height: number
  fps: number
  quality: QualityPreset
}

export interface ExportRequest {
  model: TimelineModel
  media: MediaItem[]
  options: ExportOptions
  outputPath: string
}

export interface ExportProgress {
  /** 0..1, based on encoded time vs total timeline duration. */
  ratio: number
  timeSeconds: number
}
