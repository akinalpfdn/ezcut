/** Thumbnail extraction profile. */
export const THUMBNAIL_CONFIG = {
  width: 320,
  /** ffmpeg -q:v: 2 (best) .. 31 (worst). */
  quality: 4,
  extension: 'jpg',
  /** Seek to this fraction of the duration to dodge black intro frames. */
  seekFraction: 0.1,
  maxSeekSeconds: 2
} as const
