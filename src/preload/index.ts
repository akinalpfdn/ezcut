import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IpcChannels, type ElectronAPI } from '@shared'

const electronAPI: ElectronAPI = {
  getMediaToolingInfo: () => ipcRenderer.invoke(IpcChannels.getMediaToolingInfo),
  openMediaFileDialog: () => ipcRenderer.invoke(IpcChannels.openMediaFileDialog),
  openMediaFilesDialog: () => ipcRenderer.invoke(IpcChannels.openMediaFilesDialog),
  probeMediaFile: (filePath) => ipcRenderer.invoke(IpcChannels.probeMediaFile, filePath),
  importMediaFile: (filePath) => ipcRenderer.invoke(IpcChannels.importMediaFile, filePath),
  generateWaveform: (path, durationSeconds) =>
    ipcRenderer.invoke(IpcChannels.generateWaveform, path, durationSeconds),
  saveRecording: (data, extension) => ipcRenderer.invoke(IpcChannels.saveRecording, data, extension),
  generateDenoiseProxy: (mediaPath, strength) =>
    ipcRenderer.invoke(IpcChannels.generateDenoiseProxy, mediaPath, strength),
  generateProxy: (mediaPath, durationSeconds) =>
    ipcRenderer.invoke(IpcChannels.generateProxy, mediaPath, durationSeconds),
  generateFilmstrip: (mediaPath, durationSeconds) =>
    ipcRenderer.invoke(IpcChannels.generateFilmstrip, mediaPath, durationSeconds),
  cancelMediaJobs: (mediaPath) => ipcRenderer.invoke(IpcChannels.cancelMediaJobs, mediaPath),
  onProxyProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: unknown): void =>
      callback(progress as Parameters<typeof callback>[0])
    ipcRenderer.on(IpcChannels.proxyProgress, listener)
    return () => ipcRenderer.removeListener(IpcChannels.proxyProgress, listener)
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings),
  selectExportPath: (container) => ipcRenderer.invoke(IpcChannels.selectExportPath, container),
  startExport: (request) => ipcRenderer.invoke(IpcChannels.startExport, request),
  cancelExport: () => ipcRenderer.invoke(IpcChannels.cancelExport),
  onExportProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: unknown): void =>
      callback(progress as Parameters<typeof callback>[0])
    ipcRenderer.on(IpcChannels.exportProgress, listener)
    return () => ipcRenderer.removeListener(IpcChannels.exportProgress, listener)
  },
  saveProject: (project) => ipcRenderer.invoke(IpcChannels.saveProject, project),
  loadProject: () => ipcRenderer.invoke(IpcChannels.loadProject),
  autosaveProject: (project) => ipcRenderer.invoke(IpcChannels.autosaveProject, project),
  loadAutosave: () => ipcRenderer.invoke(IpcChannels.loadAutosave)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
