/** Single source of truth for IPC channel names. Used by main and preload. */

export const IpcChannels = {
  getMediaToolingInfo: 'media:getToolingInfo',
  openMediaFileDialog: 'dialog:openMediaFile',
  openMediaFilesDialog: 'dialog:openMediaFiles',
  probeMediaFile: 'probe:mediaFile',
  importMediaFile: 'media:import',
  saveRecording: 'media:saveRecording',
  generateDenoiseProxy: 'denoise:generateProxy',
  loadSettings: 'settings:load',
  saveSettings: 'settings:save'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
