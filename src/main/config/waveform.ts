/** Waveform extraction profile. A low sample rate keeps the decoded PCM small;
 * it is plenty for a visual envelope. */
export const WAVEFORM_CONFIG = {
  sampleRate: 8000,
  channels: 1,
  bucketCount: 600
} as const
