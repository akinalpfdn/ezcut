import { BrowserWindow, dialog } from 'electron'
import { MEDIA_OPEN_FILTERS } from '../../config/mediaFormats'

/** Opens a native single-file media picker. Resolves to the chosen absolute path,
 * or null if the user cancelled. */
export async function openMediaFileDialog(): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow() ?? undefined
  const options = {
    properties: ['openFile' as const],
    filters: MEDIA_OPEN_FILTERS
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0] ?? null
}

/** Opens a native multi-select media picker. Resolves to the chosen absolute
 * paths (empty array if the user cancelled). */
export async function openMediaFilesDialog(): Promise<string[]> {
  const parent = BrowserWindow.getFocusedWindow() ?? undefined
  const options = {
    properties: ['openFile' as const, 'multiSelections' as const],
    filters: MEDIA_OPEN_FILTERS
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return []
  return result.filePaths
}
