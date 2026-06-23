/** Timeline clip filmstrip: a single horizontal sprite of evenly-spaced frames
 * across the full source duration, cached per source and mapped to each clip's
 * trimmed slice in the renderer. */
export const FILMSTRIP_CONFIG = {
  /** Number of frames tiled into the strip. */
  frames: 12,
  /** Per-frame pixel size in the sprite (16:9-ish; stretched to clip height in CSS). */
  frameWidth: 84,
  height: 48,
  /** ffmpeg -q:v (2 = best … 31 = worst); small files, decent preview. */
  quality: 5,
  extension: 'jpg'
} as const
