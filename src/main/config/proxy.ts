/** Preview-proxy profile. Sources that aren't fast/decodable in WebCodecs
 * (non-mp4 containers, oversized, or non-h264 codecs) are transcoded to a small
 * short-GOP H.264 mp4 used only for preview decode — never for export. */
export const PROXY_CONFIG = {
  /** Proxy any video wider than this — anything above 720p gets a light 720p
   * preview proxy (CapCut-style optimized media): fast decode, small frames, and
   * small demuxed chunks so the in-memory cache stays bounded for long videos. */
  maxSourceWidth: 1280,
  /** Codecs the canvas compositor decodes directly (others get a proxy). */
  supportedCodecs: ['h264'],
  /** mp4box only demuxes these containers; anything else needs a proxy. */
  mp4FamilyPattern: /mp4|mov|m4v/i,
  /** Proxy output: 720p, short GOP for fast seeking, low bitrate (preview only). */
  proxyWidth: 1280,
  gop: 15,
  crf: 28,
  preset: 'veryfast',
  extension: 'mp4'
} as const
