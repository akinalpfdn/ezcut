import type { ProjectFile, Result } from '@shared'

/** Renderer facade over the preload project bridge. */
export const projectService = {
  save(project: ProjectFile): Promise<Result<boolean>> {
    return window.electronAPI.saveProject(project)
  },
  load(): Promise<Result<ProjectFile | null>> {
    return window.electronAPI.loadProject()
  },
  autosave(project: ProjectFile): Promise<Result<void>> {
    return window.electronAPI.autosaveProject(project)
  },
  loadAutosave(): Promise<Result<ProjectFile | null>> {
    return window.electronAPI.loadAutosave()
  }
}
