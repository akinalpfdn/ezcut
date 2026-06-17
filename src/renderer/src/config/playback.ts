/** Preview playback constants. */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const
export const DEFAULT_SPEED = 1
export const DEFAULT_VOLUME = 1
/** Used for frame-stepping when a clip has no detected fps (e.g. audio). */
export const FALLBACK_FPS = 30
/** Max source-time vs timeline-time drift before the engine resyncs an element. */
export const DRIFT_TOLERANCE_SECONDS = 0.15
export const DEFAULT_MASTER_VOLUME = 1
/** Per-clip volume range for the inspector. */
export const MAX_CLIP_VOLUME = 2
