import { resolveFfmpegPath } from './binaryPaths'
import { spawnToBuffer } from './process'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { WAVEFORM_CONFIG } from '../../config/waveform'
import type { WaveformData } from '@shared'

const BYTES_PER_SAMPLE = 2 // s16le
const INT16_MAX = 32768

/** Decodes audio to PCM and reduces it to one normalized peak per bucket. */
export async function generateWaveform(sourcePath: string): Promise<WaveformData> {
  const pcm = await spawnToBuffer(resolveFfmpegPath(), FFMPEG_ARGS.pcm(sourcePath))
  return downsample(pcm, WAVEFORM_CONFIG.bucketCount)
}

function downsample(pcm: Buffer, bucketCount: number): WaveformData {
  const sampleCount = Math.floor(pcm.length / BYTES_PER_SAMPLE)
  const peaks = new Array<number>(bucketCount).fill(0)
  if (sampleCount === 0) return { peaks, bucketCount }

  const samplesPerBucket = Math.max(1, Math.floor(sampleCount / bucketCount))
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = bucket * samplesPerBucket
    const end = Math.min(start + samplesPerBucket, sampleCount)
    let peak = 0
    for (let i = start; i < end; i++) {
      const magnitude = Math.abs(pcm.readInt16LE(i * BYTES_PER_SAMPLE))
      if (magnitude > peak) peak = magnitude
    }
    peaks[bucket] = peak / INT16_MAX
  }
  return { peaks, bucketCount }
}
