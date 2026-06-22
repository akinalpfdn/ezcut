import { PROXY_MAX_SOURCE_WIDTH, PROXY_MP4_FAMILY_PATTERN, PROXY_SUPPORTED_CODECS } from '@shared'

/** Preview-proxy profile. The policy thresholds (when to proxy) live in @shared
 * so main and renderer share one source of truth; this adds the main-only output
 * settings for the transcode (720p, short GOP, low bitrate — preview only). */
export const PROXY_CONFIG = {
  maxSourceWidth: PROXY_MAX_SOURCE_WIDTH,
  supportedCodecs: PROXY_SUPPORTED_CODECS,
  mp4FamilyPattern: PROXY_MP4_FAMILY_PATTERN,
  proxyWidth: 1280,
  gop: 15,
  crf: 28,
  preset: 'veryfast',
  extension: 'mp4'
} as const
