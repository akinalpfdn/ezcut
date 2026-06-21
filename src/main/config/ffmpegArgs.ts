/** ffmpeg/ffprobe argument profiles. No inline argument arrays elsewhere. */

import { THUMBNAIL_CONFIG } from './thumbnail'
import { WAVEFORM_CONFIG } from './waveform'
import { DENOISE_CONFIG } from './denoise'
import { PROXY_CONFIG } from './proxy'

export const FFMPEG_ARGS = {
  version: ['-version'],
  thumbnail: (input: string, seekSeconds: number, output: string): string[] => [
    '-y',
    '-ss',
    seekSeconds.toFixed(3),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    `scale=${THUMBNAIL_CONFIG.width}:-1`,
    '-q:v',
    String(THUMBNAIL_CONFIG.quality),
    output
  ],
  /** Decode audio to raw mono s16le PCM on stdout for waveform downsampling. */
  pcm: (input: string): string[] => [
    '-v',
    'error',
    '-i',
    input,
    '-ac',
    String(WAVEFORM_CONFIG.channels),
    '-ar',
    String(WAVEFORM_CONFIG.sampleRate),
    '-f',
    's16le',
    '-'
  ],
  /** Transcode a small short-GOP H.264 (video-only) preview proxy. */
  proxy: (input: string, output: string): string[] => [
    '-y',
    '-i',
    input,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    PROXY_CONFIG.preset,
    '-crf',
    String(PROXY_CONFIG.crf),
    '-g',
    String(PROXY_CONFIG.gop),
    '-sc_threshold',
    '0',
    '-vf',
    `scale='min(${PROXY_CONFIG.proxyWidth},iw)':-2`,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output
  ],
  /** Render a denoised audio-only proxy of the source. */
  denoiseProxy: (input: string, audioFilter: string, output: string): string[] => [
    '-y',
    '-i',
    input,
    '-vn',
    '-af',
    audioFilter,
    '-ar',
    String(DENOISE_CONFIG.sampleRate),
    '-ac',
    String(DENOISE_CONFIG.channels),
    output
  ]
} as const

export const FFPROBE_ARGS = {
  version: ['-version'],
  probe: (filePath: string): string[] => [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ]
} as const

/** execFile output cap — probe JSON for long files stays well under this. */
export const PROCESS_MAX_BUFFER_BYTES = 16 * 1024 * 1024
