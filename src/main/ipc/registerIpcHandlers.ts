import { shell } from 'electron'
import { handle } from './handle'
import { IpcChannels, type AppSettings } from '@shared'
import { getMediaToolingInfo } from '../services/ffmpeg/mediaToolingService'
import { probeMediaFile } from '../services/ffmpeg/probeService'
import { openMediaFileDialog, openMediaFilesDialog } from '../services/dialog/mediaDialog'
import { importMediaFile } from '../services/media/mediaImportService'
import { generateWaveform } from '../services/ffmpeg/waveformService'
import { saveRecording } from '../services/media/recordingService'
import { generateDenoiseProxy } from '../services/ffmpeg/denoiseService'
import { generateProxy } from '../services/ffmpeg/proxyService'
import { generateFilmstrip } from '../services/ffmpeg/filmstripService'
import { cancelFfmpegJobs } from '../services/ffmpeg/jobQueue'
import { loadSettings, saveSettings } from '../services/settings/settingsService'
import { runExport, cancelExport } from '../services/export/exportService'
import { selectExportPath } from '../services/dialog/exportDialog'
import {
  autosaveProject,
  loadAutosave,
  loadProject,
  saveProject
} from '../services/project/projectService'
import type { ExportContainer, ExportRequest, ProjectFile } from '@shared'

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
  handle<[string, number], Awaited<ReturnType<typeof generateWaveform>>>(
    IpcChannels.generateWaveform,
    (filePath, durationSeconds) => generateWaveform(filePath, durationSeconds)
  )
  handle<[ArrayBuffer, string], Awaited<ReturnType<typeof saveRecording>>>(
    IpcChannels.saveRecording,
    (data, extension) => saveRecording(data, extension)
  )
  handle<[string, number], { proxyPath: string }>(
    IpcChannels.generateDenoiseProxy,
    async (mediaPath, strength) => ({ proxyPath: await generateDenoiseProxy(mediaPath, strength) })
  )
  handle<[string, number], { proxyPath: string }>(
    IpcChannels.generateProxy,
    async (mediaPath, durationSeconds) => ({ proxyPath: await generateProxy(mediaPath, durationSeconds) })
  )
  handle<[string, number], { filmstripPath: string }>(
    IpcChannels.generateFilmstrip,
    async (mediaPath, durationSeconds) => ({
      filmstripPath: await generateFilmstrip(mediaPath, durationSeconds)
    })
  )
  handle<[string], void>(IpcChannels.cancelMediaJobs, (mediaPath) => cancelFfmpegJobs(mediaPath))
  handle(IpcChannels.loadSettings, () => loadSettings())
  handle<[AppSettings], void>(IpcChannels.saveSettings, (settings) => saveSettings(settings))

  handle<[ExportContainer], string | null>(IpcChannels.selectExportPath, (container) =>
    selectExportPath(container)
  )
  handle<[string], void>(IpcChannels.showInFolder, (path) => {
    shell.showItemInFolder(path)
  })
  handle<[ExportRequest], void>(IpcChannels.startExport, (request) => runExport(request))
  handle(IpcChannels.cancelExport, () => cancelExport())

  handle<[ProjectFile], boolean>(IpcChannels.saveProject, (project) => saveProject(project))
  handle(IpcChannels.loadProject, () => loadProject())
  handle<[ProjectFile], void>(IpcChannels.autosaveProject, (project) => autosaveProject(project))
  handle(IpcChannels.loadAutosave, () => loadAutosave())
}
