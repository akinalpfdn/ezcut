import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '@shared'
import { parseAppSettings } from '../../validation/schemas'

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<AppSettings | null> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    const settings = parseAppSettings(JSON.parse(raw))
    if (!settings) {
      console.warn('[settings] ignoring malformed settings file')
      return null
    }
    return settings
  } catch (error) {
    // ENOENT on first run is expected; anything else is worth a note.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[settings] load failed', error)
    }
    return null
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const path = settingsPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(settings, null, 2), 'utf-8')
}
