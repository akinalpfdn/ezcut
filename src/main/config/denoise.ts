export type DenoiseBackendId = 'afftdn' | 'arnndn'

/** Denoise profile. afftdn is the default (needs no model). arnndn (RNNoise) is
 * used only if a bundled model is present — see denoiseService. */
export const DENOISE_CONFIG = {
  defaultBackend: 'afftdn' as DenoiseBackendId,
  proxyExtension: 'wav',
  /** afftdn noise-reduction range in dB, mapped from strength 0..1. */
  afftdnMinNr: 6,
  afftdnMaxNr: 30,
  /** Bundled RNNoise model filename under resources/ (add to enable arnndn). */
  rnnoiseModelFile: 'rnnoise.rnnn',
  sampleRate: 48000,
  channels: 2
} as const
