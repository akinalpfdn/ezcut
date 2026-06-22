import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { AppError } from '../../core/AppError'
import { ErrorCodes, ErrorKeys } from '../../config/errors'
import { PROCESS_MAX_BUFFER_BYTES } from '../../config/ffmpegArgs'

export interface CommandOutput {
  stdout: string
  stderr: string
}

export interface FfmpegProgressOptions {
  /** Media duration, to convert ffmpeg's `time=` into a 0..1 ratio. */
  durationSeconds: number
  onProgress?: (ratio: number) => void
  /** Receives the spawned child so the caller can cancel (kill) it. */
  onSpawn?: (child: ChildProcess) => void
}

/** Parses ffmpeg's `time=HH:MM:SS.ms` stderr progress marker into seconds. */
function parseFfmpegTimeSeconds(text: string): number | null {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

/**
 * Spawns ffmpeg and reports progress from its stderr `time=` markers. Resolves on
 * exit code 0, rejects with the stderr tail otherwise (a cancel-kill rejects too;
 * the caller distinguishes cancellation from failure).
 */
export function runFfmpegWithProgress(
  binaryPath: string,
  args: readonly string[],
  options: FfmpegProgressOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args as string[], { windowsHide: true })
    options.onSpawn?.(child)
    let stderrTail = ''
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderrTail = (stderrTail + text).slice(-4000)
      const time = parseFfmpegTimeSeconds(text)
      if (time !== null && options.durationSeconds > 0) {
        options.onProgress?.(Math.min(time / options.durationSeconds, 1))
      }
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderrTail.trim() || `ffmpeg exited with code ${code}`))
    )
  })
}

function processError(binaryPath: string, spawnFailed: boolean, detail: string, cause: unknown): AppError {
  return new AppError({
    code: spawnFailed ? ErrorCodes.ffmpegSpawnFailed : ErrorCodes.ffmpegExited,
    messageKey: spawnFailed ? ErrorKeys.ffmpegSpawnFailed : ErrorKeys.ffmpegExited,
    params: { binary: binaryPath },
    detail,
    cause
  })
}

/**
 * Runs a bundled binary with buffered output. Distinguishes a spawn failure
 * (binary missing/not executable — the classic packaged-asar bug) from a
 * non-zero exit, surfacing each as a distinct localizable AppError.
 */
export function runCommand(binaryPath: string, args: readonly string[]): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      args as string[],
      { maxBuffer: PROCESS_MAX_BUFFER_BYTES, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const spawnFailed = (error as NodeJS.ErrnoException).code === 'ENOENT'
          reject(processError(binaryPath, spawnFailed, stderr.trim() || error.message, error))
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })
}

/**
 * Runs a binary and resolves its raw stdout as a Buffer (for PCM extraction).
 * Streams via spawn rather than buffering through execFile so long inputs do not
 * hit a fixed maxBuffer ceiling.
 */
export function spawnToBuffer(binaryPath: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args as string[], { windowsHide: true })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    child.on('error', (error) => {
      const spawnFailed = (error as NodeJS.ErrnoException).code === 'ENOENT'
      reject(processError(binaryPath, spawnFailed, error.message, error))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks))
        return
      }
      reject(processError(binaryPath, false, Buffer.concat(stderrChunks).toString('utf-8').trim(), null))
    })
  })
}
