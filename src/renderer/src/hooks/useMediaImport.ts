import { useCallback, useState } from 'react'
import type { AppErrorPayload, MediaItem } from '@shared'
import { mediaService } from '../services/mediaService'
import { useMediaStore } from '../stores/mediaStore'

interface MediaImport {
  importing: boolean
  errors: AppErrorPayload[]
  importPaths: (paths: string[]) => Promise<void>
  importViaDialog: () => Promise<void>
  clearErrors: () => void
}

export function useMediaImport(): MediaImport {
  const addItems = useMediaStore((state) => state.addItems)
  const [importing, setImporting] = useState(false)
  const [errors, setErrors] = useState<AppErrorPayload[]>([])

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setImporting(true)
      setErrors([])
      const results = await Promise.all(paths.map((path) => mediaService.importFile(path)))

      const imported: MediaItem[] = []
      const failures: AppErrorPayload[] = []
      for (const result of results) {
        if (result.ok) imported.push(result.value)
        else failures.push(result.error)
      }

      if (imported.length > 0) addItems(imported)
      setErrors(failures)
      setImporting(false)
    },
    [addItems]
  )

  const importViaDialog = useCallback(async () => {
    const result = await mediaService.openMediaFilesDialog()
    if (!result.ok) {
      setErrors([result.error])
      return
    }
    await importPaths(result.value)
  }, [importPaths])

  const clearErrors = useCallback(() => setErrors([]), [])

  return { importing, errors, importPaths, importViaDialog, clearErrors }
}
