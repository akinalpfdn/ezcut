import { type ChildProcess } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import { IpcChannels, type ExportProgress, type ExportRequest } from '@shared'
import { resolveFfmpegPath } from '../ffmpeg/binaryPaths'
import { runFfmpegWithProgress } from '../ffmpeg/process'
import { cancelFfmpegJobs } from '../ffmpeg/jobQueue'
import { generateDenoiseProxy } from '../ffmpeg/denoiseService'
import { buildFiltergraph } from './filtergraphBuilder'
import { buildExportArgs } from './exportArgs'

/** Job tag for denoise transcodes run during an export's filtergraph build, so
 * cancelExport can kill them (they happen before the export ffmpeg exists). */
const EXPORT_DENOISE_TAG = '__export_denoise__'

let currentChild: ChildProcess | null = null
let cancelled = false

function sendProgress(progress: ExportProgress): void {
  const window = BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannels.exportProgress, progress)
}

export async function runExport(request: ExportRequest): Promise<void> {
  const { model, media, options, outputPath } = request
  cancelled = false
  let textTempFiles: string[] = []
  let filterComplex = ''

  try {
    // Denoise proxies generated here are tagged so a cancel can kill them.
    const graph = await buildFiltergraph(
      model,
      media,
      { width: options.width, height: options.height, fps: options.fps },
      (mediaPath, strength) => generateDenoiseProxy(mediaPath, strength, EXPORT_DENOISE_TAG)
    )
    textTempFiles = graph.textTempFiles
    filterComplex = graph.filterComplex
    if (cancelled) return
    const args = buildExportArgs(graph, options, outputPath)

    await runFfmpegWithProgress(resolveFfmpegPath(), args, {
      durationSeconds: graph.durationSeconds,
      onProgress: (ratio) => sendProgress({ ratio, timeSeconds: ratio * graph.durationSeconds }),
      onSpawn: (child) => {
        currentChild = child
      }
    })
    sendProgress({ ratio: 1, timeSeconds: graph.durationSeconds })
  } catch (error) {
    // A cancel kills the in-flight child/denoise (which rejects) — treat as
    // cancellation, not failure.
    if (cancelled) {
      await unlink(outputPath).catch(() => undefined)
      return
    }
    // Surface the graph in the dev console so a filter parse error is debuggable.
    console.error('[export] failed; filter_complex:\n', filterComplex)
    throw error
  } finally {
    currentChild = null
    await Promise.all(textTempFiles.map((path) => unlink(path).catch(() => undefined)))
  }
}

export function cancelExport(): void {
  cancelled = true
  currentChild?.kill()
  currentChild = null
  cancelFfmpegJobs(EXPORT_DENOISE_TAG)
}
