import { useEffect } from 'react'
import { useMediaStore } from '../../stores/mediaStore'
import { useProxyStore } from '../../stores/proxyStore'
import { mediaService } from '../../services/mediaService'
import { previewNeedsProxy } from '../../utils/proxyPolicy'

/**
 * Eagerly generates preview proxies for media that needs one (so a clip is ready
 * to drop on the timeline without an on-demand wait), and forwards transcode
 * progress from the main process into the proxy store.
 */
export function useProxyManager(): void {
  const items = useMediaStore((state) => state.items)

  useEffect(() => {
    return mediaService.onProxyProgress(({ mediaPath, ratio }) => {
      useProxyStore.getState().setProgress(mediaPath, ratio)
    })
  }, [])

  useEffect(() => {
    for (const item of items) {
      if (previewNeedsProxy(item)) useProxyStore.getState().ensureProxy(item.path, item.durationSeconds)
    }
  }, [items])
}
