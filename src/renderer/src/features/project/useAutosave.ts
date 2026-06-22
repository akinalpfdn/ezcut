import { useEffect } from 'react'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { projectService } from '../../services/projectService'
import { currentProject } from './projectActions'
import { autosaveGate } from './autosaveGate'

/** Debounced autosave of the session to userData whenever the model or media
 * change. Gated on the initial restore so empty startup state can't clobber a
 * saved autosave — but once open it DOES save the empty state (e.g. after the
 * last media is deleted), so deletions survive a refresh. */
export function useAutosave(): void {
  const model = useTimelineStore((state) => state.model)
  const items = useMediaStore((state) => state.items)

  useEffect(() => {
    if (!autosaveGate.ready) return
    const handle = setTimeout(() => {
      void projectService.autosave(currentProject())
    }, 1000)
    return () => clearTimeout(handle)
  }, [model, items])
}
