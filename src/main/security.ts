import { app, session, shell } from 'electron'
import { CONTENT_SECURITY_POLICY } from './config/window'

/** Electron-vite sets ELECTRON_RENDERER_URL only while running the dev server. */
const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

/**
 * Process-wide navigation/window hardening that complements the per-window
 * sandbox + contextIsolation flags: external links open in the OS browser,
 * in-app navigation away from the app origin is blocked, and a strict CSP is
 * applied in production (dev relies on Vite's own dev-server headers).
 */
export function applySecurityHardening(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      const allowedOrigin = process.env['ELECTRON_RENDERER_URL']
      const isInternal = url.startsWith('file://') || (allowedOrigin && url.startsWith(allowedOrigin))
      if (!isInternal) event.preventDefault()
    })
  })

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CONTENT_SECURITY_POLICY]
        }
      })
    })
  }
}
