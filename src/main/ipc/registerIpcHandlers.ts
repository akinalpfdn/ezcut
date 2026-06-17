import { handle } from './handle'
import { IpcChannels } from '@shared'
import { getMediaToolingInfo } from '../services/ffmpeg/mediaToolingService'
import { probeMediaFile } from '../services/ffmpeg/probeService'
import { openMediaFileDialog } from '../services/dialog/mediaDialog'

export function registerIpcHandlers(): void {
  handle(IpcChannels.getMediaToolingInfo, () => getMediaToolingInfo())
  handle(IpcChannels.openMediaFileDialog, () => openMediaFileDialog())
  handle<[string], Awaited<ReturnType<typeof probeMediaFile>>>(
    IpcChannels.probeMediaFile,
    (filePath) => probeMediaFile(filePath)
  )
}
