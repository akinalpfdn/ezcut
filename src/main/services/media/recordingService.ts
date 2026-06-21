import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { importMediaFile } from './mediaImportService'
import type { MediaItem } from '@shared'

/** Persists a recorded audio blob to userData and imports it as a MediaItem. */
export async function saveRecording(data: ArrayBuffer, extension: string): Promise<MediaItem> {
  const dir = join(app.getPath('userData'), 'recordings')
  await mkdir(dir, { recursive: true })
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'webm'
  const filePath = join(dir, `recording-${randomUUID()}.${safeExtension}`)
  await writeFile(filePath, Buffer.from(data))
  return importMediaFile(filePath)
}
