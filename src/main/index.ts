import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { buildAppMenu } from './menu'
import { applySecurityHardening } from './security'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { runStartupSelfCheck } from './core/selfCheck'
import { installFatalLogger } from './core/fatalLogger'
import { registerMediaProtocolScheme, registerMediaProtocolHandler } from './services/media/mediaProtocol'

installFatalLogger()
// Privileged scheme registration must happen before the app is ready.
registerMediaProtocolScheme()

app.whenReady().then(() => {
  // Must run after ready: it touches session.defaultSession, which is only
  // available once the app is ready. Registered before any window is created.
  applySecurityHardening()
  registerMediaProtocolHandler()
  registerIpcHandlers()
  buildAppMenu()
  void runStartupSelfCheck()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
