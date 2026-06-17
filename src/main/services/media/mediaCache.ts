import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { THUMBNAIL_CONFIG } from '../../config/thumbnail'

/** Ensures and returns the per-user thumbnail cache directory. */
export async function getThumbnailCacheDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'cache', 'thumbnails')
  await mkdir(dir, { recursive: true })
  return dir
}

export function thumbnailPathForId(cacheDir: string, id: string): string {
  return join(cacheDir, `thumb-${id}.${THUMBNAIL_CONFIG.extension}`)
}
