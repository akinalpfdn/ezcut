import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type ElectronAPI } from '@shared'

const electronAPI: ElectronAPI = {
  getMediaToolingInfo: () => ipcRenderer.invoke(IpcChannels.getMediaToolingInfo),
  openMediaFileDialog: () => ipcRenderer.invoke(IpcChannels.openMediaFileDialog),
  probeMediaFile: (filePath) => ipcRenderer.invoke(IpcChannels.probeMediaFile, filePath)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
