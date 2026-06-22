import { type ChildProcess } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import { IpcChannels, type ExportProgress, type ExportRequest } from '@shared'
import { resolveFfmpegPath } from '../ffmpeg/binaryPaths'
import { runFfmpegWithProgress } from '../ffmpeg/process'
import { generateDenoiseProxy } from '../ffmpeg/denoiseService'
import { buildFiltergraph } from './filtergraphBuilder'
import { buildExportArgs } from './exportArgs'

let currentChild: ChildProcess | null = null
let cancelled = false

function sendProgress(progress: ExportProgress): void {
  const window = BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannels.exportProgress, progress)
}

export async function runExport(request: ExportRequest): Promise<void> {
  const { model, media, options, outputPath } = request
  cancelled = false
  const graph = await buildFiltergraph(
    model,
    media,
    { width: options.width, height: options.height, fps: options.fps },
    generateDenoiseProxy
  )
  // buildFiltergraph may run denoise transcodes before the export ffmpeg exists,
  // so a cancel during that phase has no child to kill — honor it here so we
  // don't go on to encode. (Killing the in-flight denoise ffmpeg is a separate,
  // later change.)
  if (cancelled) return
  const args = buildExportArgs(graph, options, outputPath)

  try {
    await runFfmpegWithProgress(resolveFfmpegPath(), args, {
      durationSeconds: graph.durationSeconds,
      onProgress: (ratio) => sendProgress({ ratio, timeSeconds: ratio * graph.durationSeconds }),
      onSpawn: (child) => {
        currentChild = child
      }
    })
    sendProgress({ ratio: 1, timeSeconds: graph.durationSeconds })
  } catch (error) {
    // A cancel kills the child (rejects) — that's success, not a failure.
    if (cancelled) {
      await unlink(outputPath).catch(() => undefined)
      return
    }
    throw error
  } finally {
    currentChild = null
  }
}

export function cancelExport(): void {
  cancelled = true
  currentChild?.kill()
  currentChild = null
}
