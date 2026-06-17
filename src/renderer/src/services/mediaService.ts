import type { MediaItem, MediaProbeResult, MediaToolingInfo, Result } from '@shared'

/**
 * Renderer-side facade over the preload bridge. Components/hooks call this — never
 * `window.electronAPI` directly — keeping the bridge a single, swappable seam.
 */
export const mediaService = {
  getToolingInfo(): Promise<Result<MediaToolingInfo>> {
    return window.electronAPI.getMediaToolingInfo()
  },
  openMediaFilesDialog(): Promise<Result<string[]>> {
    return window.electronAPI.openMediaFilesDialog()
  },
  probe(filePath: string): Promise<Result<MediaProbeResult>> {
    return window.electronAPI.probeMediaFile(filePath)
  },
  importFile(filePath: string): Promise<Result<MediaItem>> {
    return window.electronAPI.importMediaFile(filePath)
  },
  getPathForFile(file: File): string {
    return window.electronAPI.getPathForFile(file)
  }
}
