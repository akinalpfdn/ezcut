import type { Result } from '../core/result'
import type { MediaProbeResult, MediaToolingInfo } from '../media/types'

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

  /** Probes a media file and returns structured metadata. */
  probeMediaFile(path: string): Promise<Result<MediaProbeResult>>
}
