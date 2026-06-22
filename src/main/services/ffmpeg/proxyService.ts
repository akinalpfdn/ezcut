import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { resolveFfmpegPath } from './binaryPaths'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { PROXY_CONFIG } from '../../config/proxy'
import { allowMediaFile } from '../media/mediaProtocol'
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
  return createHash('md5')
    .update(`${PROXY_CONFIG.proxyWidth}|${PROXY_CONFIG.gop}|${PROXY_CONFIG.crf}|${mediaPath}`)
    .digest('hex')
}

function sendProgress(mediaPath: string, ratio: number): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(IpcChannels.proxyProgress, { mediaPath, ratio })
}

function parseTimeSeconds(text: string): number | null {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

function transcode(mediaPath: string, proxyPath: string, durationSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveFfmpegPath(), FFMPEG_ARGS.proxy(mediaPath, proxyPath), { windowsHide: true })
    let stderrTail = ''
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderrTail = (stderrTail + text).slice(-4000)
      const time = parseTimeSeconds(text)
      if (time !== null && durationSeconds > 0) sendProgress(mediaPath, Math.min(time / durationSeconds, 1))
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderrTail.trim() || `ffmpeg exited with code ${code}`))
    )
  })
}

/** Returns a cached preview proxy path, transcoding it (with progress) if needed. */
export async function generateProxy(mediaPath: string, durationSeconds: number): Promise<string> {
  const dir = await proxyDir()
  const proxyPath = join(dir, `${proxyKey(mediaPath)}.${PROXY_CONFIG.extension}`)

  if (await fileExists(proxyPath)) {
    sendProgress(mediaPath, 1)
  } else {
    await transcode(mediaPath, proxyPath, durationSeconds)
    sendProgress(mediaPath, 1)
  }
  allowMediaFile(proxyPath)
  return proxyPath
}
