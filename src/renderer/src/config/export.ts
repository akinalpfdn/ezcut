import type { ExportContainer, QualityPreset } from '@shared'

export const EXPORT_CONTAINERS: ExportContainer[] = ['mp4', 'mov', 'webm']
export const QUALITY_PRESETS: QualityPreset[] = ['high', 'medium', 'low']
export const EXPORT_FPS_OPTIONS = [24, 30, 60]

export interface ResolutionPreset {
  id: string
  width?: number
  height?: number
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: 'source' },
  { id: '1080p', width: 1920, height: 1080 },
  { id: '720p', width: 1280, height: 720 },
  { id: '480p', width: 854, height: 480 },
  { id: 'custom' }
]

export const DEFAULT_EXPORT = {
  container: 'mp4' as ExportContainer,
  fps: 30,
  quality: 'high' as QualityPreset,
  width: 1920,
  height: 1080
}
