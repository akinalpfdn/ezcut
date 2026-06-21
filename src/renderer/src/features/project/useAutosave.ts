import { useEffect } from 'react'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { projectService } from '../../services/projectService'
import { currentProject } from './projectActions'

/** Debounced autosave of the session to userData whenever the model or media change. */
export function useAutosave(): void {
  const model = useTimelineStore((state) => state.model)
  const items = useMediaStore((state) => state.items)

  useEffect(() => {
    if (items.length === 0 && Object.keys(model.clips).length === 0) return
    const handle = setTimeout(() => {
      void projectService.autosave(currentProject())
    }, 1000)
    return () => clearTimeout(handle)
  }, [model, items])
}
