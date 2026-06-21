import type { ExportContainer, QualityPreset } from '@shared'

interface ContainerProfile {
  extension: string
  videoCodec: string
  audioCodec: string
}

/** Strategy: container → codec profile. */
export const CONTAINER_PROFILES: Record<ExportContainer, ContainerProfile> = {
  mp4: { extension: 'mp4', videoCodec: 'libx264', audioCodec: 'aac' },
  mov: { extension: 'mov', videoCodec: 'libx264', audioCodec: 'aac' },
  webm: { extension: 'webm', videoCodec: 'libvpx-vp9', audioCodec: 'libopus' }
}

/** Quality → CRF, per codec family (lower = better quality). */
export const QUALITY_CRF: Record<QualityPreset, { x264: number; vp9: number }> = {
  high: { x264: 18, vp9: 24 },
  medium: { x264: 23, vp9: 31 },
  low: { x264: 28, vp9: 37 }
}
