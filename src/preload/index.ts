import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels, type ElectronAPI } from '@shared'

const electronAPI: ElectronAPI = {
  getMediaToolingInfo: () => ipcRenderer.invoke(IpcChannels.getMediaToolingInfo),
  openMediaFileDialog: () => ipcRenderer.invoke(IpcChannels.openMediaFileDialog),
  openMediaFilesDialog: () => ipcRenderer.invoke(IpcChannels.openMediaFilesDialog),
  probeMediaFile: (filePath) => ipcRenderer.invoke(IpcChannels.probeMediaFile, filePath),
  importMediaFile: (filePath) => ipcRenderer.invoke(IpcChannels.importMediaFile, filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
