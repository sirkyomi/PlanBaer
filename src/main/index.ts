import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendFileSync } from 'node:fs'
import { initializeDatabase, getSettings, closeDatabase } from './database'
import { configureUpdates, registerIpc, checkForUpdates } from './ipc'
import { createEncryptedLocalSnapshot } from './services'

let mainWindow: BrowserWindow | null = null
const appDirname = dirname(fileURLToPath(import.meta.url))

function reportFatal(error: unknown): void {
  const message = error instanceof Error ? `${error.stack ?? error.message}` : String(error)
  try { appendFileSync(join(app.getPath('userData'), 'planbaer-error.log'), `[${new Date().toISOString()}]\n${message}\n\n`, 'utf8') } catch { /* error dialog remains available */ }
  dialog.showErrorBox('PlanBär konnte nicht starten', message)
}

process.on('uncaughtException', reportFatal)
process.on('unhandledRejection', reportFatal)

function createWindow(): BrowserWindow {
  const settings = getSettings()
  nativeTheme.themeSource = settings.theme
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101827' : '#f5f8ff',
    backgroundMaterial: process.platform === 'win32' ? 'mica' : 'none',
    title: 'PlanBär',
    webPreferences: {
      preload: join(appDirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    reportFatal(new Error(`Renderer konnte nicht geladen werden (${code}): ${description}\n${url}`))
  })
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    reportFatal(new Error(`Preload konnte nicht geladen werden: ${preloadPath}\n${error.stack ?? error.message}`))
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(appDirname, '../renderer/index.html'))
  return window
}

app.whenReady().then(async () => {
  app.setAppUserModelId('de.planbaer.desktop')
  initializeDatabase()
  mainWindow = createWindow()
  registerIpc(mainWindow)
  configureUpdates(mainWindow)
  try { await createEncryptedLocalSnapshot() } catch (error) { console.error('Lokales Backup fehlgeschlagen', error) }
  if (app.isPackaged) {
    setTimeout(() => { if (mainWindow) void checkForUpdates(mainWindow) }, 15_000)
    setInterval(() => { if (mainWindow) void checkForUpdates(mainWindow) }, 6 * 60 * 60 * 1000)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
}).catch(reportFatal)

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => closeDatabase())
