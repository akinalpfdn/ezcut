import { resolveFfmpegPath } from './binaryPaths'
import { runCommand } from './process'
import { runFfmpegJob } from './jobQueue'
import { cachedArtifact } from './artifactCache'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { FILMSTRIP_CONFIG } from '../../config/filmstrip'

/**
 * Returns a cached horizontal filmstrip (one sprite of evenly-spaced frames over
 * the full source). Keyed by source + strip dimensions so trimming/zooming reuses
 * the same image — the renderer maps each clip's slice onto it.
 */
export async function generateFilmstrip(sourcePath: string, durationSeconds: number): Promise<string> {
  if (!(durationSeconds > 0)) {
    throw new Error(`filmstrip: invalid duration ${durationSeconds} for ${sourcePath}`)
  }
  return cachedArtifact(
    'filmstrip',
    [FILMSTRIP_CONFIG.frames, FILMSTRIP_CONFIG.frameWidth, FILMSTRIP_CONFIG.height, sourcePath],
    FILMSTRIP_CONFIG.extension,
    async (outputPath) => {
      await runFfmpegJob(sourcePath, (onSpawn) =>
        runCommand(resolveFfmpegPath(), FFMPEG_ARGS.filmstrip(sourcePath, durationSeconds, outputPath), onSpawn)
      )
    }
  )
}
