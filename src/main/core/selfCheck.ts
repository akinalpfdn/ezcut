import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getMediaToolingInfo } from '../services/ffmpeg/mediaToolingService'
import { AppError } from './AppError'

const SELF_CHECK_FILENAME = 'ezcut-selfcheck.json'

/**
 * On startup, proves ffmpeg/ffprobe execute from their resolved paths and
 * records the result to the temp dir. In a packaged build this is the
 * deterministic way to confirm the asar-unpacked path works without driving the
 * UI; temp is always present and writable, unlike a not-yet-created userData dir.
 */
export async function runStartupSelfCheck(): Promise<void> {
  const outputPath = join(tmpdir(), SELF_CHECK_FILENAME)
  const timestamp = new Date().toISOString()
  try {
    const tooling = await getMediaToolingInfo()
    console.log('[selfcheck] ffmpeg tooling OK', tooling)
    await writeFile(outputPath, JSON.stringify({ ok: true, timestamp, tooling }, null, 2), 'utf-8')
  } catch (caught) {
    const error =
      caught instanceof AppError
        ? caught.toPayload()
        : { code: 'UNKNOWN', messageKey: 'errors.unknown', detail: String(caught) }
    console.error('[selfcheck] ffmpeg tooling FAILED', error)
    await writeFile(outputPath, JSON.stringify({ ok: false, timestamp, error }, null, 2), 'utf-8')
  }
}
