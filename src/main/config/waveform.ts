/** Waveform extraction profile. A low sample rate keeps the decoded PCM small;
 * it is plenty for a visual envelope. Bucket count scales with duration so long
 * clips stay dense (a fixed count makes long clips look like a sparse line chart). */
export const WAVEFORM_CONFIG = {
  sampleRate: 8000,
  channels: 1,
  peaksPerSecond: 50,
  minBuckets: 400,
  maxBuckets: 4000
} as const
