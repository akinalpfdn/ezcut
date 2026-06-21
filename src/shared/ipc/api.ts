import type { Result } from '../core/result'
import type { MediaItem, MediaProbeResult, MediaToolingInfo } from '../media/types'
import type { AppSettings } from '../settings/types'

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
}
