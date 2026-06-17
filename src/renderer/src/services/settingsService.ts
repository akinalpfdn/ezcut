import type { AppSettings, Result } from '@shared'

/** Renderer facade over the preload settings bridge. */
export const settingsService = {
  load(): Promise<Result<AppSettings | null>> {
    return window.electronAPI.loadSettings()
  },
  save(settings: AppSettings): Promise<Result<void>> {
    return window.electronAPI.saveSettings(settings)
  }
}
