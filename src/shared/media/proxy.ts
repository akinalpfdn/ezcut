/**
 * Proxy-policy constants shared by the main process (import-time needsProxy
 * decision from the probe) and the renderer (preview-time decision from the
 * MediaItem). Single source of truth so the two never diverge.
 */

/** Sources wider than this get a 720p preview proxy. */
export const PROXY_MAX_SOURCE_WIDTH = 1280

/** Containers mp4box can demux directly; anything else needs a proxy. */
export const PROXY_MP4_FAMILY_PATTERN = /mp4|mov|m4v/i

/** Codecs the canvas compositor decodes directly; others get a proxy. */
export const PROXY_SUPPORTED_CODECS = ['h264'] as const
