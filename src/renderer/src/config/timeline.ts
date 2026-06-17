/** Timeline view + interaction constants. */
export const TIMELINE_CONFIG = {
  defaultPxPerSec: 80,
  minPxPerSec: 20,
  maxPxPerSec: 400,
  zoomFactor: 1.25,
  /** Snap distance in pixels (converted to seconds at the current zoom). */
  snapThresholdPx: 8,
  trackHeight: 64,
  rulerHeight: 28,
  /** Shortest clip allowed after a split or trim, in seconds. */
  minClipDuration: 0.1
} as const

/** Tolerance for treating two clips as contiguous when merging. */
export const MERGE_TOLERANCE_SECONDS = 0.05
