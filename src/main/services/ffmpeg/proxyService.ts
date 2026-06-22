import { BrowserWindow } from 'electron'
import { resolveFfmpegPath } from './binaryPaths'
import { runFfmpegWithProgress } from './process'
import { cachedArtifact } from './artifactCache'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { PROXY_CONFIG } from '../../config/proxy'
import { IpcChannels, type MediaProbeResult } from '@shared'

/**
 * Decides whether a source needs a preview proxy: the canvas compositor demuxes
 * mp4/mov only and decodes h264 directly, so non-mp4 containers, oversized video,
 * or other codecs are transcoded to a small short-GOP H.264 proxy for preview.
 */
export function needsProxy(probe: MediaProbeResult): boolean {
  if (!probe.hasVideo) return false
  if (!PROXY_CONFIG.mp4FamilyPattern.test(probe.formatName)) return true
  if (probe.width && probe.width > PROXY_CONFIG.maxSourceWidth) return true
  const videoCodec = probe.streams.find((stream) => stream.kind === 'video')?.codecName.toLowerCase()
  const supported = PROXY_CONFIG.supportedCodecs as readonly string[]
  if (videoCodec && !supported.includes(videoCodec)) return true
  return false
}

function sendProgress(mediaPath: string, ratio: number): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(IpcChannels.proxyProgress, { mediaPath, ratio })
}

/** Returns a cached preview proxy path, transcoding it (with progress) if needed. */
export async function generateProxy(mediaPath: string, durationSeconds: number): Promise<string> {
  const proxyPath = await cachedArtifact(
    'proxy',
    [PROXY_CONFIG.proxyWidth, PROXY_CONFIG.gop, PROXY_CONFIG.crf, mediaPath],
    PROXY_CONFIG.extension,
    (outputPath) =>
      runFfmpegWithProgress(resolveFfmpegPath(), FFMPEG_ARGS.proxy(mediaPath, outputPath), {
        durationSeconds,
        onProgress: (ratio) => sendProgress(mediaPath, ratio)
      })
  )
  sendProgress(mediaPath, 1)
  return proxyPath
}
