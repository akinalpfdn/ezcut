import {
  createFile,
  DataStream,
  Endianness,
  MP4BoxBuffer,
  type ISOFile,
  type Movie,
  type Sample
} from 'mp4box'

export interface DemuxedVideo {
  config: VideoDecoderConfig
  chunks: EncodedVideoChunk[]
}

export interface DemuxedAudio {
  config: AudioDecoderConfig
  chunks: EncodedAudioChunk[]
}

export interface DemuxResult {
  durationSeconds: number
  video?: DemuxedVideo
  audio?: DemuxedAudio
}

/** Serializes a track's codec-config box (avcC/hvcC/vpcC/av1C) into the byte
 * sequence WebCodecs expects as `description`. */
function buildDescription(file: ISOFile, trackId: number): Uint8Array | undefined {
  // mp4box's deeply-nested box types are not ergonomically exposed for this
  // traversal, so reach into the parsed boxes directly.
  const trak = file.getTrackById(trackId) as unknown as {
    mdia?: { minf?: { stbl?: { stsd?: { entries?: Array<Record<string, { write(stream: DataStream): void }>> } } } }
  }
  const entries = trak.mdia?.minf?.stbl?.stsd?.entries
  if (!entries) return undefined
  for (const entry of entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C
    if (box) {
      const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
      box.write(stream)
      // Strip the 8-byte box header to get the raw config record.
      return new Uint8Array(stream.buffer.slice(8, stream.byteLength))
    }
  }
  return undefined
}

function toChunkInit(sample: Sample): { type: EncodedVideoChunkType; timestamp: number; duration: number; data: Uint8Array } {
  return {
    type: sample.is_sync ? 'key' : 'delta',
    timestamp: (sample.cts / sample.timescale) * 1_000_000,
    duration: (sample.duration / sample.timescale) * 1_000_000,
    data: sample.data ?? new Uint8Array(0)
  }
}

// Demuxed results (encoded chunks + configs) are cached by url so revisiting a
// clip never re-fetches or re-parses the file — only the cheap decode/seek runs.
// Compressed chunks are small relative to decoded frames; bound the cache by
// total bytes and evict least-recently-used.
const MAX_CACHE_BYTES = 300 * 1024 * 1024
const demuxCache = new Map<string, DemuxResult>()
let demuxCacheBytes = 0

function resultBytes(result: DemuxResult): number {
  let bytes = 0
  for (const chunk of result.video?.chunks ?? []) bytes += chunk.byteLength
  for (const chunk of result.audio?.chunks ?? []) bytes += chunk.byteLength
  return bytes
}

/** demux(), memoized by url with a byte-bounded LRU. */
export async function demuxCached(fileUrl: string): Promise<DemuxResult> {
  const hit = demuxCache.get(fileUrl)
  if (hit) {
    demuxCache.delete(fileUrl)
    demuxCache.set(fileUrl, hit) // move to most-recently-used
    return hit
  }
  const result = await demux(fileUrl)
  demuxCache.set(fileUrl, result)
  demuxCacheBytes += resultBytes(result)
  while (demuxCacheBytes > MAX_CACHE_BYTES && demuxCache.size > 1) {
    const oldestKey = demuxCache.keys().next().value as string
    const oldest = demuxCache.get(oldestKey)
    if (oldest) demuxCacheBytes -= resultBytes(oldest)
    demuxCache.delete(oldestKey)
  }
  return result
}

/**
 * Demuxes an mp4/mov file (fetched via the ezmedia protocol) into WebCodecs
 * decoder configs + encoded chunks. Loads the whole file; callers should prefer
 * demuxCached() so revisits don't re-fetch/re-parse.
 */
export async function demux(fileUrl: string): Promise<DemuxResult> {
  const response = await fetch(fileUrl)
  const buffer = await response.arrayBuffer()
  const file = createFile()

  return new Promise<DemuxResult>((resolve, reject) => {
    const videoChunks: EncodedVideoChunk[] = []
    const audioChunks: EncodedAudioChunk[] = []
    let videoConfig: VideoDecoderConfig | undefined
    let audioConfig: AudioDecoderConfig | undefined
    let videoTrackId = -1
    let audioTrackId = -1
    let videoExpected = 0
    let audioExpected = 0
    let durationSeconds = 0

    const tryResolve = (): void => {
      const videoDone = videoTrackId < 0 || videoChunks.length >= videoExpected
      const audioDone = audioTrackId < 0 || audioChunks.length >= audioExpected
      if (videoDone && audioDone) {
        resolve({
          durationSeconds,
          video: videoConfig ? { config: videoConfig, chunks: videoChunks } : undefined,
          audio: audioConfig ? { config: audioConfig, chunks: audioChunks } : undefined
        })
      }
    }

    file.onError = (_module, message) => reject(new Error(message))

    file.onReady = (info: Movie) => {
      durationSeconds = info.timescale > 0 ? info.duration / info.timescale : 0
      const videoTrack = info.videoTracks[0]
      const audioTrack = info.audioTracks[0]

      if (videoTrack) {
        videoTrackId = videoTrack.id
        videoExpected = videoTrack.nb_samples
        videoConfig = {
          codec: videoTrack.codec,
          codedWidth: videoTrack.video?.width ?? videoTrack.track_width,
          codedHeight: videoTrack.video?.height ?? videoTrack.track_height,
          description: buildDescription(file, videoTrack.id)
        }
        file.setExtractionOptions(videoTrack.id, null, { nbSamples: videoTrack.nb_samples })
      }

      if (audioTrack) {
        audioTrackId = audioTrack.id
        audioExpected = audioTrack.nb_samples
        audioConfig = {
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio?.sample_rate ?? 48_000,
          numberOfChannels: audioTrack.audio?.channel_count ?? 2,
          description: buildDescription(file, audioTrack.id)
        }
        file.setExtractionOptions(audioTrack.id, null, { nbSamples: audioTrack.nb_samples })
      }

      if (!videoTrack && !audioTrack) {
        reject(new Error('No decodable video or audio track'))
        return
      }
      file.start()
    }

    file.onSamples = (id, _user, samples: Sample[]) => {
      for (const sample of samples) {
        const init = toChunkInit(sample)
        if (id === videoTrackId) videoChunks.push(new EncodedVideoChunk(init))
        else if (id === audioTrackId) audioChunks.push(new EncodedAudioChunk(init))
      }
      tryResolve()
    }

    file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0))
    file.flush()
  })
}
