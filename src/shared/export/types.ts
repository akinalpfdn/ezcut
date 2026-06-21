import type { TimelineModel } from '../timeline/types'
import type { MediaItem } from '../media/types'

export type ExportContainer = 'mp4' | 'mov' | 'webm'
export type QualityPreset = 'high' | 'medium' | 'low'

export interface ExportOptions {
  container: ExportContainer
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
