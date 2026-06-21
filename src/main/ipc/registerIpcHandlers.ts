import { handle } from './handle'
import { IpcChannels, type AppSettings } from '@shared'
import { getMediaToolingInfo } from '../services/ffmpeg/mediaToolingService'
import { probeMediaFile } from '../services/ffmpeg/probeService'
import { openMediaFileDialog, openMediaFilesDialog } from '../services/dialog/mediaDialog'
import { importMediaFile } from '../services/media/mediaImportService'
import { saveRecording } from '../services/media/recordingService'
import { generateDenoiseProxy } from '../services/ffmpeg/denoiseService'
import { loadSettings, saveSettings } from '../services/settings/settingsService'

export function registerIpcHandlers(): void {
  handle(IpcChannels.getMediaToolingInfo, () => getMediaToolingInfo())
  handle(IpcChannels.openMediaFileDialog, () => openMediaFileDialog())
  handle(IpcChannels.openMediaFilesDialog, () => openMediaFilesDialog())
  handle<[string], Awaited<ReturnType<typeof probeMediaFile>>>(
    IpcChannels.probeMediaFile,
    (filePath) => probeMediaFile(filePath)
  )
  handle<[string], Awaited<ReturnType<typeof importMediaFile>>>(
    IpcChannels.importMediaFile,
    (filePath) => importMediaFile(filePath)
  )
  handle<[ArrayBuffer, string], Awaited<ReturnType<typeof saveRecording>>>(
    IpcChannels.saveRecording,
    (data, extension) => saveRecording(data, extension)
  )
  handle<[string, number], { proxyPath: string }>(
    IpcChannels.generateDenoiseProxy,
    async (mediaPath, strength) => ({ proxyPath: await generateDenoiseProxy(mediaPath, strength) })
  )
  handle(IpcChannels.loadSettings, () => loadSettings())
  handle<[AppSettings], void>(IpcChannels.saveSettings, (settings) => saveSettings(settings))
}
