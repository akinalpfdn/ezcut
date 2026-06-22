import { resolveFfmpegPath } from './binaryPaths'
import { runCommand } from './process'
import { runFfmpegJob } from './jobQueue'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { THUMBNAIL_CONFIG } from '../../config/thumbnail'

function computeSeekSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const target = durationSeconds * THUMBNAIL_CONFIG.seekFraction
  return Math.min(target, THUMBNAIL_CONFIG.maxSeekSeconds, durationSeconds / 2)
}

/** Extracts a single representative frame to `outputPath`. Throws on failure. */
export async function generateThumbnail(
  sourcePath: string,
  durationSeconds: number,
  outputPath: string
): Promise<void> {
  const seek = computeSeekSeconds(durationSeconds)
  await runFfmpegJob(sourcePath, (onSpawn) =>
    runCommand(resolveFfmpegPath(), FFMPEG_ARGS.thumbnail(sourcePath, seek, outputPath), onSpawn)
  )
}
