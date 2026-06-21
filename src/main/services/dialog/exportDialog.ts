import { BrowserWindow, dialog } from 'electron'
import type { ExportContainer } from '@shared'
import { CONTAINER_PROFILES } from '../../config/export'

/** Save dialog for the export output path; resolves to a path or null if cancelled. */
export async function selectExportPath(container: ExportContainer): Promise<string | null> {
  const profile = CONTAINER_PROFILES[container]
  const parent = BrowserWindow.getFocusedWindow() ?? undefined
  const options = {
    defaultPath: `export.${profile.extension}`,
    filters: [{ name: container.toUpperCase(), extensions: [profile.extension] }]
  }
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}
