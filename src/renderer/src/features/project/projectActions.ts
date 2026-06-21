import { PROJECT_FILE_VERSION, type ProjectFile } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { projectService } from '../../services/projectService'

/** Snapshot the current edit state into a serializable project. */
export function currentProject(): ProjectFile {
  return {
    version: PROJECT_FILE_VERSION,
    model: useTimelineStore.getState().model,
    media: useMediaStore.getState().items
  }
}

/** Replace the current session with a loaded project. */
export function applyProject(project: ProjectFile): void {
  useMediaStore.getState().setItems(project.media)
  useTimelineStore.getState().loadModel(project.model)
}

export async function saveCurrentProject(): Promise<void> {
  await projectService.save(currentProject())
}

export async function openProject(): Promise<void> {
  const result = await projectService.load()
  if (result.ok && result.value) applyProject(result.value)
}
