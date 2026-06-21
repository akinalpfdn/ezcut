import { createHash } from 'node:crypto'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveFfmpegPath } from './binaryPaths'
import { runCommand } from './process'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { PROXY_CONFIG } from '../../config/proxy'
import { allowMediaFile } from '../media/mediaProtocol'
import type { MediaProbeResult } from '@shared'

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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function proxyDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'cache', 'proxy')
  await mkdir(dir, { recursive: true })
  return dir
}

function proxyKey(mediaPath: string): string {
  return createHash('md5').update(`${PROXY_CONFIG.proxyWidth}|${PROXY_CONFIG.gop}|${mediaPath}`).digest('hex')
}

/** Returns a cached preview proxy path, transcoding it if needed. */
export async function generateProxy(mediaPath: string): Promise<string> {
  const dir = await proxyDir()
  const proxyPath = join(dir, `${proxyKey(mediaPath)}.${PROXY_CONFIG.extension}`)

  if (!(await fileExists(proxyPath))) {
    await runCommand(resolveFfmpegPath(), FFMPEG_ARGS.proxy(mediaPath, proxyPath))
  }
  allowMediaFile(proxyPath)
  return proxyPath
}
