import type { MediaItem, MediaProbeResult, MediaToolingInfo, ProxyProgress, Result, WaveformData } from '@shared'

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
  generateWaveform(filePath: string, durationSeconds: number): Promise<Result<WaveformData>> {
    return window.electronAPI.generateWaveform(filePath, durationSeconds)
  },
  saveRecording(data: ArrayBuffer, extension: string): Promise<Result<MediaItem>> {
    return window.electronAPI.saveRecording(data, extension)
  },
  generateDenoiseProxy(mediaPath: string, strength: number): Promise<Result<{ proxyPath: string }>> {
    return window.electronAPI.generateDenoiseProxy(mediaPath, strength)
  },
  generateProxy(mediaPath: string, durationSeconds: number): Promise<Result<{ proxyPath: string }>> {
    return window.electronAPI.generateProxy(mediaPath, durationSeconds)
  },
  onProxyProgress(callback: (progress: ProxyProgress) => void): () => void {
    return window.electronAPI.onProxyProgress(callback)
  },
  cancelMediaJobs(mediaPath: string): Promise<Result<void>> {
    return window.electronAPI.cancelMediaJobs(mediaPath)
  },
  getPathForFile(file: File): string {
    return window.electronAPI.getPathForFile(file)
  }
}
