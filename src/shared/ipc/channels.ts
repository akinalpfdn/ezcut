/** Single source of truth for IPC channel names. Used by main and preload. */

export const IpcChannels = {
  getMediaToolingInfo: 'media:getToolingInfo',
  openMediaFileDialog: 'dialog:openMediaFile',
  openMediaFilesDialog: 'dialog:openMediaFiles',
  probeMediaFile: 'probe:mediaFile',
  importMediaFile: 'media:import',
  generateWaveform: 'media:waveform',
  saveRecording: 'media:saveRecording',
  generateDenoiseProxy: 'denoise:generateProxy',
  loadSettings: 'settings:load',
  saveSettings: 'settings:save',
  selectExportPath: 'export:selectPath',
  startExport: 'export:start',
  cancelExport: 'export:cancel',
  exportProgress: 'export:progress',
  saveProject: 'project:save',
  loadProject: 'project:load',
  autosaveProject: 'project:autosave',
  loadAutosave: 'project:loadAutosave'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
