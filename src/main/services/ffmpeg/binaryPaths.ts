import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { AppError } from '../../core/AppError'
import { ErrorCodes, ErrorKeys } from '../../config/errors'

/**
 * In a packaged build the binaries are unpacked out of app.asar (see
 * electron-builder `asarUnpack`). The path resolved by ffmpeg-static/ffprobe-static
 * still points inside app.asar, where it cannot be executed, so rewrite it to the
 * unpacked location. In dev the path contains no "app.asar", making this a no-op.
 */
function toUnpackedPath(binaryPath: string): string {
  return binaryPath.replace('app.asar', 'app.asar.unpacked')
}

export function resolveFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new AppError({
      code: ErrorCodes.unsupportedPlatform,
      messageKey: ErrorKeys.unsupportedPlatform,
      detail: 'ffmpeg-static returned no binary path for this platform/arch.'
    })
  }
  return toUnpackedPath(ffmpegStatic)
}

export function resolveFfprobePath(): string {
  const probePath = ffprobeStatic?.path
  if (!probePath) {
    throw new AppError({
      code: ErrorCodes.unsupportedPlatform,
      messageKey: ErrorKeys.unsupportedPlatform,
      detail: 'ffprobe-static returned no binary path for this platform/arch.'
    })
  }
  return toUnpackedPath(probePath)
}
