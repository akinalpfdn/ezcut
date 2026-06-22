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
/** Budget for the decoded-audio (AudioBuffer) LRU cache. decodeAudioData keeps a
 * whole clip's PCM in RAM (~22 MB/min stereo 48k), so this bounds how much is
 * retained across clips. The cap only bites when exceeded — small projects never
 * fill it, so it's set generously (~90 min of audio) to avoid re-decode churn on
 * larger projects. The real fix for very long material is streaming decode. */
export const AUDIO_BUFFER_CACHE_BYTES = 2 * 1024 * 1024 * 1024
