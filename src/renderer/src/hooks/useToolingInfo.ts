import { useCallback, useEffect, useState } from 'react'
import type { AppErrorPayload, MediaToolingInfo } from '@shared'
import { mediaService } from '../services/mediaService'

interface ToolingState {
  loading: boolean
  info: MediaToolingInfo | null
  error: AppErrorPayload | null
}

const INITIAL: ToolingState = { loading: true, info: null, error: null }

export function useToolingInfo(): ToolingState & { reload: () => Promise<void> } {
  const [state, setState] = useState<ToolingState>(INITIAL)

  const reload = useCallback(async () => {
    setState(INITIAL)
    const result = await mediaService.getToolingInfo()
    setState(
      result.ok
        ? { loading: false, info: result.value, error: null }
        : { loading: false, info: null, error: result.error }
    )
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}
