/** Single source of truth for IPC channel names. Used by main and preload. */

export const IpcChannels = {
  getMediaToolingInfo: 'media:getToolingInfo',
  openMediaFileDialog: 'dialog:openMediaFile',
  probeMediaFile: 'probe:mediaFile'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
