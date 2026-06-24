/** ffmpeg filter parameters for per-clip audio cleanup/enhancement (export). */
export const AUDIO_FX_CONFIG = {
  /** EBU R128 loudness normalization target. */
  loudnorm: 'loudnorm=I=-16:TP=-1.5:LRA=11',
  /** Gentle noise gate for speech (linear threshold). */
  gate: 'agate=threshold=0.02:ratio=2:attack=10:release=200',
  compressor: 'acompressor',
  eq: {
    /** Low shelf (bass) centre frequency, Hz. */
    lowFreq: 120,
    /** Mid peak frequency + octave width. */
    midFreq: 1000,
    midWidth: 1,
    /** High shelf (treble) centre frequency, Hz. */
    highFreq: 6000
  }
} as const
