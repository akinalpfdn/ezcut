import type { MediaProbeResult, MediaToolingInfo, Result } from '@shared'

/**
 * Renderer-side facade over the preload bridge. Components/hooks call this — never
 * `window.electronAPI` directly — keeping the bridge a single, swappable seam.
 */
export const mediaService = {
  getToolingInfo(): Promise<Result<MediaToolingInfo>> {
    return window.electronAPI.getMediaToolingInfo()
  },
  openMediaFileDialog(): Promise<Result<string | null>> {
    return window.electronAPI.openMediaFileDialog()
  },
  probe(filePath: string): Promise<Result<MediaProbeResult>> {
    return window.electronAPI.probeMediaFile(filePath)
  }
}
