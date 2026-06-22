import { PROXY_MAX_SOURCE_WIDTH, type MediaItem } from '@shared'

/** Re-exported single source of truth (shared with the main process). */
export const PREVIEW_PROXY_MAX_WIDTH = PROXY_MAX_SOURCE_WIDTH

/**
 * Whether a clip's preview should decode from a proxy rather than the original.
 * Recomputed in the renderer (not just the persisted MediaItem.needsProxy) so a
 * threshold change applies to already-imported media without re-importing —
 * keeping every clip on a uniform 720p decode path (one warm decoder, no
 * per-resolution cold-start stalls).
 */
export function previewNeedsProxy(media: MediaItem): boolean {
  if (media.needsProxy) return true
  if (!media.hasVideo) return false
  return media.width !== undefined && media.width > PREVIEW_PROXY_MAX_WIDTH
}
