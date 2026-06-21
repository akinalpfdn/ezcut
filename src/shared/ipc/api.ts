import type { Result } from '../core/result'
import type { MediaItem, MediaProbeResult, MediaToolingInfo, WaveformData } from '../media/types'
import type { AppSettings } from '../settings/types'
import type { ExportContainer, ExportProgress, ExportRequest } from '../export/types'
import type { ProjectFile } from '../project/types'

/**
 * The typed surface the preload bridge exposes on `window.electronAPI`.
 * This is the ONLY contract between renderer and main. Every method returns a
 * `Result` so failures are handled explicitly rather than thrown across the bridge.
 */
export interface ElectronAPI {
  /** ffmpeg/ffprobe versions + resolved paths — verifies binaries execute. */
  getMediaToolingInfo(): Promise<Result<MediaToolingInfo>>

  /** Opens a native file picker; resolves to the chosen path, or null if cancelled. */
  openMediaFileDialog(): Promise<Result<string | null>>

  /** Opens a native multi-select file picker; resolves to the chosen paths (empty if cancelled). */
  openMediaFilesDialog(): Promise<Result<string[]>>

  /** Probes a media file and returns structured metadata. */
  probeMediaFile(path: string): Promise<Result<MediaProbeResult>>

  /** Probes a file and generates its derived assets (thumbnail or waveform),
   * returning a library-ready MediaItem. */
  importMediaFile(path: string): Promise<Result<MediaItem>>

  /** Generates a waveform for an already-imported media path (backfill for items
   * that were imported before waveforms were generated, e.g. older projects).
   * durationSeconds is the container duration so peaks align to clip time. */
  generateWaveform(path: string, durationSeconds: number): Promise<Result<WaveformData>>

  /** Persists a recorded audio blob to disk and imports it as a MediaItem. */
  saveRecording(data: ArrayBuffer, extension: string): Promise<Result<MediaItem>>

  /** Generates (or returns a cached) denoised audio proxy for a source file at a
   * given strength; resolves to the proxy's absolute path. */
  generateDenoiseProxy(mediaPath: string, strength: number): Promise<Result<{ proxyPath: string }>>

  /** Resolves the absolute path of a dropped File (Electron `webUtils`).
   * Synchronous; not a Result — it cannot fail meaningfully. */
  getPathForFile(file: File): string

  /** Loads persisted settings, or null if none saved yet. */
  loadSettings(): Promise<Result<AppSettings | null>>

  /** Persists settings to userData. */
  saveSettings(settings: AppSettings): Promise<Result<void>>

  /** Opens a save dialog for the export output; resolves to a path or null. */
  selectExportPath(container: ExportContainer): Promise<Result<string | null>>

  /** Runs the export to completion (or cancellation). Progress arrives via onExportProgress. */
  startExport(request: ExportRequest): Promise<Result<void>>

  /** Cancels an in-progress export. */
  cancelExport(): Promise<Result<void>>

  /** Subscribes to export progress events; returns an unsubscribe function. */
  onExportProgress(callback: (progress: ExportProgress) => void): () => void

  /** Saves a project via a save dialog; resolves true if saved, false if cancelled. */
  saveProject(project: ProjectFile): Promise<Result<boolean>>

  /** Opens a project via an open dialog; resolves to the project, or null if cancelled. */
  loadProject(): Promise<Result<ProjectFile | null>>

  /** Writes an autosave snapshot to userData (no dialog). */
  autosaveProject(project: ProjectFile): Promise<Result<void>>

  /** Loads the autosave snapshot, or null if none. */
  loadAutosave(): Promise<Result<ProjectFile | null>>
}
