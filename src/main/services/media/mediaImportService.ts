import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { probeMediaFile } from '../ffmpeg/probeService'
import { generateThumbnail } from '../ffmpeg/thumbnailService'
import { generateWaveform } from '../ffmpeg/waveformService'
import { needsProxy } from '../ffmpeg/proxyService'
import { getThumbnailCacheDir, thumbnailPathForId } from './mediaCache'
import { allowMediaFile } from './mediaProtocol'
import type { MediaItem, WaveformData } from '@shared'

/**
 * Probes a file and builds a library-ready MediaItem. Probe failure is fatal
 * (no metadata = no item); derived-asset generation (thumbnail/waveform) is
 * best-effort — a clip with a missing thumbnail still imports.
 */
export async function importMediaFile(filePath: string): Promise<MediaItem> {
  const probe = await probeMediaFile(filePath)
  const id = randomUUID()
  const item: MediaItem = {
    id,
    path: filePath,
    name: basename(filePath),
    kind: probe.hasVideo ? 'video' : 'audio',
    durationSeconds: probe.durationSeconds,
    sizeBytes: probe.sizeBytes,
    hasVideo: probe.hasVideo,
    hasAudio: probe.hasAudio
  }
  if (probe.width) item.width = probe.width
  if (probe.height) item.height = probe.height
  if (probe.fps) item.fps = probe.fps
  if (needsProxy(probe)) item.needsProxy = true

  allowMediaFile(filePath)

  // Thumbnail for video; a waveform for anything with audio (incl. video clips,
  // so the timeline can show audio peaks for cut-by-sound editing).
  if (item.kind === 'video') {
    item.thumbnailPath = await tryGenerateThumbnail(filePath, id, probe.durationSeconds)
  }
  if (item.hasAudio) {
    item.waveform = await tryGenerateWaveform(filePath, probe.durationSeconds)
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
