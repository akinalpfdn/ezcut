import { Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * Skeleton application menu built entirely from Electron roles. Role-based items
 * are localized by the OS, so this introduces no hardcoded user-facing strings.
 * App-specific actions (Open, Export, …) are added in later phases through the
 * i18n layer.
 */
export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
