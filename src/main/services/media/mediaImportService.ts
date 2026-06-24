import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { probeMediaFile } from '../ffmpeg/probeService'
import { generateThumbnail } from '../ffmpeg/thumbnailService'
import { generateWaveform } from '../ffmpeg/waveformService'
import { needsProxy } from '../ffmpeg/proxyService'
import { getThumbnailCacheDir, thumbnailPathForId } from './mediaCache'
import { allowMediaFile } from './mediaProtocol'
import { DEFAULT_IMAGE_DURATION, type MediaItem, type MediaProbeResult, type WaveformData } from '@shared'

/** Codecs ffprobe reports for still images (single frame, no duration/audio). */
const IMAGE_CODECS = new Set([
  'png',
  'mjpeg',
  'jpeg',
  'jpegls',
  'bmp',
  'gif',
  'webp',
  'tiff',
  'ppm',
  'pgm',
  'apng'
])

/** A still image: a lone image-codec video stream, no audio, no real duration. */
function isImageProbe(probe: MediaProbeResult): boolean {
  if (!probe.hasVideo || probe.hasAudio || probe.durationSeconds > 0) return false
  const codec = probe.streams.find((stream) => stream.kind === 'video')?.codecName.toLowerCase()
  return !!codec && IMAGE_CODECS.has(codec)
}

/**
 * Probes a file and builds a library-ready MediaItem. Probe failure is fatal
 * (no metadata = no item); derived-asset generation (thumbnail/waveform) is
 * best-effort — a clip with a missing thumbnail still imports.
 */
export async function importMediaFile(filePath: string): Promise<MediaItem> {
  const probe = await probeMediaFile(filePath)
  const id = randomUUID()
  const isImage = isImageProbe(probe)
  const item: MediaItem = {
    id,
    path: filePath,
    name: basename(filePath),
    kind: isImage ? 'image' : probe.hasVideo ? 'video' : 'audio',
    durationSeconds: isImage ? DEFAULT_IMAGE_DURATION : probe.durationSeconds,
    sizeBytes: probe.sizeBytes,
    // An image is drawn directly (no decode pipeline), so it isn't "video".
    hasVideo: isImage ? false : probe.hasVideo,
    hasAudio: probe.hasAudio
  }
  if (probe.width) item.width = probe.width
  if (probe.height) item.height = probe.height
  if (!isImage && probe.fps) item.fps = probe.fps
  if (!isImage && needsProxy(probe)) item.needsProxy = true

  allowMediaFile(filePath)

  if (isImage) {
    // The image file is its own thumbnail (shown in the bin and the preview).
    item.thumbnailPath = filePath
  } else {
    // Thumbnail for video; a waveform for anything with audio (incl. video clips,
    // so the timeline can show audio peaks for cut-by-sound editing).
    if (item.kind === 'video') {
      item.thumbnailPath = await tryGenerateThumbnail(filePath, id, probe.durationSeconds)
    }
    if (item.hasAudio) {
      item.waveform = await tryGenerateWaveform(filePath, probe.durationSeconds)
    }
  }

  return item
}

async function tryGenerateThumbnail(
  filePath: string,
  id: string,
  durationSeconds: number
): Promise<string | undefined> {
  try {
    const cacheDir = await getThumbnailCacheDir()
    const thumbnailPath = thumbnailPathForId(cacheDir, id)
    await generateThumbnail(filePath, durationSeconds, thumbnailPath)
    allowMediaFile(thumbnailPath)
    return thumbnailPath
  } catch (error) {
    console.warn('[import] thumbnail generation failed', filePath, error)
    return undefined
  }
}

async function tryGenerateWaveform(
  filePath: string,
  durationSeconds: number
): Promise<WaveformData | undefined> {
  try {
    return await generateWaveform(filePath, durationSeconds)
  } catch (error) {
    console.warn('[import] waveform generation failed', filePath, error)
    return undefined
  }
}
