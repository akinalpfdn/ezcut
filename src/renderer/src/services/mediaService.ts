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
  saveRecording(data: ArrayBuffer, extension: string): Promise<Result<MediaItem>> {
    return window.electronAPI.saveRecording(data, extension)
  },
  generateDenoiseProxy(mediaPath: string, strength: number): Promise<Result<{ proxyPath: string }>> {
    return window.electronAPI.generateDenoiseProxy(mediaPath, strength)
  },
  getPathForFile(file: File): string {
    return window.electronAPI.getPathForFile(file)
  }
}
