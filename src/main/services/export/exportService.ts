import { spawn, type ChildProcess } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import { IpcChannels, type ExportProgress, type ExportRequest } from '@shared'
import { resolveFfmpegPath } from '../ffmpeg/binaryPaths'
import { generateDenoiseProxy } from '../ffmpeg/denoiseService'
import { buildFiltergraph } from './filtergraphBuilder'
import { CONTAINER_PROFILES, QUALITY_CRF } from '../../config/export'

let currentChild: ChildProcess | null = null
let cancelled = false

function sendProgress(progress: ExportProgress): void {
  const window = BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannels.exportProgress, progress)
}

function parseTimeSeconds(text: string): number | null {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

export async function runExport(request: ExportRequest): Promise<void> {
  const { model, media, options, outputPath } = request
  const graph = await buildFiltergraph(
    model,
    media,
    { width: options.width, height: options.height, fps: options.fps },
    generateDenoiseProxy
  )

  const profile = CONTAINER_PROFILES[options.container]
  const isVp9 = profile.videoCodec.includes('vp9')
  const crf = isVp9 ? QUALITY_CRF[options.quality].vp9 : QUALITY_CRF[options.quality].x264

  const args: string[] = ['-y']
  for (const input of graph.inputs) args.push('-i', input)
  args.push('-filter_complex', graph.filterComplex)
  args.push('-map', `[${graph.videoLabel}]`)
  if (graph.audioLabel) args.push('-map', `[${graph.audioLabel}]`)
  args.push('-c:v', profile.videoCodec, '-crf', String(crf), '-pix_fmt', 'yuv420p')
  if (profile.videoCodec === 'libx264') args.push('-preset', 'medium')
  if (graph.audioLabel) args.push('-c:a', profile.audioCodec)
  args.push('-t', graph.durationSeconds.toFixed(3), outputPath)

  await new Promise<void>((resolve, reject) => {
    cancelled = false
    const child = spawn(resolveFfmpegPath(), args, { windowsHide: true })
    currentChild = child
    let stderrTail = ''

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderrTail = (stderrTail + text).slice(-4000)
      const time = parseTimeSeconds(text)
      if (time !== null) {
        sendProgress({ ratio: Math.min(time / graph.durationSeconds, 1), timeSeconds: time })
      }
    })

    child.on('error', (error) => {
      currentChild = null
      reject(error)
    })

    child.on('close', (code) => {
      currentChild = null
      if (cancelled) {
        void unlink(outputPath).catch(() => undefined)
        resolve()
        return
      }
      if (code === 0) {
        sendProgress({ ratio: 1, timeSeconds: graph.durationSeconds })
        resolve()
      } else {
        reject(new Error(stderrTail.trim() || `ffmpeg exited with code ${code}`))
      }
    })
  })
}

export function cancelExport(): void {
  cancelled = true
  currentChild?.kill()
  currentChild = null
}
