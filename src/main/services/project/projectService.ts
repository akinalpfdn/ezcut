import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { PROJECT_FILE_EXTENSION, type ProjectFile } from '@shared'
import { allowMediaFile } from '../media/mediaProtocol'
import { parseProjectFile } from '../../validation/schemas'

function autosavePath(): string {
  return join(app.getPath('userData'), `autosave.${PROJECT_FILE_EXTENSION}`)
}

/** Re-permit a loaded project's media + thumbnails through the ezmedia protocol. */
function reallowProjectMedia(project: ProjectFile): void {
  for (const item of project.media) {
    allowMediaFile(item.path)
    if (item.thumbnailPath) allowMediaFile(item.thumbnailPath)
  }
}

const PROJECT_FILTERS = [{ name: 'ezcut project', extensions: [PROJECT_FILE_EXTENSION] }]

export async function saveProject(project: ProjectFile): Promise<boolean> {
  const parent = BrowserWindow.getFocusedWindow() ?? undefined
  const options = { defaultPath: `project.${PROJECT_FILE_EXTENSION}`, filters: PROJECT_FILTERS }
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return false
  await writeFile(result.filePath, JSON.stringify(project, null, 2), 'utf-8')
  return true
}

export async function loadProject(): Promise<ProjectFile | null> {
  const parent = BrowserWindow.getFocusedWindow() ?? undefined
  const options = { properties: ['openFile' as const], filters: PROJECT_FILTERS }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  const project = parseProjectFile(JSON.parse(await readFile(filePath, 'utf-8')))
  if (!project) throw new Error('The selected file is not a valid ezcut project.')
  reallowProjectMedia(project)
  return project
}

export async function autosaveProject(project: ProjectFile): Promise<void> {
  const path = autosavePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(project), 'utf-8')
}

export async function loadAutosave(): Promise<ProjectFile | null> {
  try {
    const project = parseProjectFile(JSON.parse(await readFile(autosavePath(), 'utf-8')))
    if (!project) return null
    reallowProjectMedia(project)
    return project
  } catch {
    return null
  }
}
