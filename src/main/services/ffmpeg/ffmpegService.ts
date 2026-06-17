import { resolveFfmpegPath } from './binaryPaths'
import { runCommand } from './process'
import { parseToolVersion } from './versionParser'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'

export async function getFfmpegVersion(): Promise<string> {
  const { stdout } = await runCommand(resolveFfmpegPath(), FFMPEG_ARGS.version)
  return parseToolVersion(stdout)
}
