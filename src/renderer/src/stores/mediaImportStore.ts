import { create } from 'zustand'
import type { AppErrorPayload, MediaItem } from '@shared'
import { mediaService } from '../services/mediaService'
import { useMediaStore } from './mediaStore'

interface MediaImportState {
  importing: boolean
  errors: AppErrorPayload[]
  /** Probes + derives each path, adds successes to the bin, and returns them.
   * Failures (e.g. non-media files) land in `errors`. Shared by the bin and the
   * timeline so both surfaces import through one pipeline and one error list. */
  importPaths: (paths: string[]) => Promise<MediaItem[]>
  importViaDialog: () => Promise<void>
  clearErrors: () => void
}

export const useMediaImportStore = create<MediaImportState>((set, get) => ({
  importing: false,
  errors: [],

  importPaths: async (paths) => {
    if (paths.length === 0) return []
    set({ importing: true, errors: [] })
    const results = await Promise.all(paths.map((path) => mediaService.importFile(path)))

    const imported: MediaItem[] = []
    const failures: AppErrorPayload[] = []
    for (const result of results) {
      if (result.ok) imported.push(result.value)
      else failures.push(result.error)
    }

    if (imported.length > 0) useMediaStore.getState().addItems(imported)
    set({ errors: failures, importing: false })
    return imported
  },

  importViaDialog: async () => {
    const result = await mediaService.openMediaFilesDialog()
    if (!result.ok) {
      set({ errors: [result.error] })
      return
    }
    await get().importPaths(result.value)
  },

  clearErrors: () => set({ errors: [] })
}))
