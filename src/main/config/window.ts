/** Native window + security configuration. Not component styling — these are
 * process-level constants and intentionally centralized here. */

export const WINDOW_CONFIG = {
  width: 1280,
  height: 800,
  minWidth: 960,
  minHeight: 600,
  /** Matches the renderer's --color-bg token to avoid a white flash on load. */
  backgroundColor: '#121214'
} as const

/** Production Content-Security-Policy. Dev relies on Vite's own dev-server policy. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: file:",
  "font-src 'self'",
  "connect-src 'self'"
].join('; ')
