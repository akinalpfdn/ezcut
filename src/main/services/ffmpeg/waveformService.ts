import { resolveFfmpegPath } from './binaryPaths'
import { spawnToBuffer } from './process'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { WAVEFORM_CONFIG } from '../../config/waveform'
import type { WaveformData } from '@shared'

const BYTES_PER_SAMPLE = 2 // s16le
const INT16_MAX = 32768

/**
 * Decodes audio to PCM and reduces it to one normalized peak per bucket. Buckets
 * span the media's full (container) duration, so when the audio stream is shorter
 * than the container the peaks stay aligned to clip time and the tail reads as
 * silence — rather than the audio being stretched across the whole clip.
 */
export async function generateWaveform(
  sourcePath: string,
  durationSeconds: number
): Promise<WaveformData> {
  const pcm = await spawnToBuffer(resolveFfmpegPath(), FFMPEG_ARGS.pcm(sourcePath))
  return downsample(pcm, bucketCountFor(durationSeconds), durationSeconds)
}

function bucketCountFor(durationSeconds: number): number {
  const n = Math.round(durationSeconds * WAVEFORM_CONFIG.peaksPerSecond) || WAVEFORM_CONFIG.minBuckets
  return Math.min(WAVEFORM_CONFIG.maxBuckets, Math.max(WAVEFORM_CONFIG.minBuckets, n))
}

function downsample(pcm: Buffer, bucketCount: number, durationSeconds: number): WaveformData {
  const sampleCount = Math.floor(pcm.length / BYTES_PER_SAMPLE)
  const peaks = new Array<number>(bucketCount).fill(0)
  if (sampleCount === 0) return { peaks, bucketCount }

  // Span the container duration (>= decoded audio) so peaks map to real time.
  const spanSamples =
    durationSeconds > 0
      ? Math.max(sampleCount, Math.floor(durationSeconds * WAVEFORM_CONFIG.sampleRate))
      : sampleCount
  const samplesPerBucket = Math.max(1, Math.floor(spanSamples / bucketCount))
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
