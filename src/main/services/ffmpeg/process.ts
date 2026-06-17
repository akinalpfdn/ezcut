import { execFile } from 'node:child_process'
import { AppError } from '../../core/AppError'
import { ErrorCodes, ErrorKeys } from '../../config/errors'
import { PROCESS_MAX_BUFFER_BYTES } from '../../config/ffmpegArgs'

export interface CommandOutput {
  stdout: string
  stderr: string
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
          reject(
            new AppError({
              code: spawnFailed ? ErrorCodes.ffmpegSpawnFailed : ErrorCodes.ffmpegExited,
              messageKey: spawnFailed ? ErrorKeys.ffmpegSpawnFailed : ErrorKeys.ffmpegExited,
              params: { binary: binaryPath },
              detail: stderr.trim() || error.message,
              cause: error
            })
          )
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })
}
