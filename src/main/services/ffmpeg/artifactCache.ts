import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { allowMediaFile } from '../media/mediaProtocol'

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Returns the path to a cached ffmpeg-derived artifact (proxy, denoise proxy,
 * …), generating it once into `userData/cache/<subdir>/<md5(keyParts)>.<ext>` if
 * absent. Shared by the proxy and denoise services so the dir/key/exists/allow
 * boilerplate lives in one place; `generate` does the actual ffmpeg work.
 *
 * Generation writes to a unique temp file and atomically renames it into place on
 * success, so a killed/crashed ffmpeg can never leave a partial artifact at the
 * final path that a later call would treat as valid.
 */
export async function cachedArtifact(
  subdir: string,
  keyParts: readonly (string | number)[],
  extension: string,
  generate: (outputPath: string) => Promise<void>
): Promise<string> {
  const dir = join(app.getPath('userData'), 'cache', subdir)
  await mkdir(dir, { recursive: true })
  const key = createHash('md5').update(keyParts.join('|')).digest('hex')
  const outputPath = join(dir, `${key}.${extension}`)

  if (!(await fileExists(outputPath))) {
    // Keep the real extension last so ffmpeg still infers the muxer; the uuid
    // segment avoids collisions between concurrent generations.
    const tmpPath = join(dir, `${key}.${randomUUID()}.tmp.${extension}`)
    try {
      await generate(tmpPath)
      await rename(tmpPath, outputPath)
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined)
      throw error
    }
  }
  allowMediaFile(outputPath)
  return outputPath
}
