import type { ExportContainer, ExportProgress, ExportRequest, Result } from '@shared'

/** Renderer facade over the preload export bridge. */
export const exportService = {
  selectPath(container: ExportContainer): Promise<Result<string | null>> {
    return window.electronAPI.selectExportPath(container)
  },
  start(request: ExportRequest): Promise<Result<void>> {
    return window.electronAPI.startExport(request)
  },
  cancel(): Promise<Result<void>> {
    return window.electronAPI.cancelExport()
  },
  onProgress(callback: (progress: ExportProgress) => void): () => void {
    return window.electronAPI.onExportProgress(callback)
  }
}
