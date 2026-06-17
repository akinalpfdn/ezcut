import { resolveFfmpegPath, resolveFfprobePath } from './binaryPaths'
import { getFfmpegVersion } from './ffmpegService'
import { getFfprobeVersion } from './probeService'
import type { MediaToolingInfo } from '@shared'

/** Resolves versions + paths, proving both binaries execute from their resolved
 * (asar-unpacked, in a packaged build) locations. */
export async function getMediaToolingInfo(): Promise<MediaToolingInfo> {
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    getFfmpegVersion(),
    getFfprobeVersion()
  ])
  return {
    ffmpegVersion,
    ffprobeVersion,
    ffmpegPath: resolveFfmpegPath(),
    ffprobePath: resolveFfprobePath()
  }
}
