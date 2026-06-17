import { execFile, spawn } from 'node:child_process'
import { AppError } from '../../core/AppError'
import { ErrorCodes, ErrorKeys } from '../../config/errors'
import { PROCESS_MAX_BUFFER_BYTES } from '../../config/ffmpegArgs'

export interface CommandOutput {
  stdout: string
  stderr: string
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
