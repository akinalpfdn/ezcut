/** Single source of truth for IPC channel names. Used by main and preload. */

export const IpcChannels = {
  getMediaToolingInfo: 'media:getToolingInfo',
  openMediaFileDialog: 'dialog:openMediaFile',
  openMediaFilesDialog: 'dialog:openMediaFiles',
  probeMediaFile: 'probe:mediaFile',
  importMediaFile: 'media:import'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
