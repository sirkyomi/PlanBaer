import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import electronUpdater from 'electron-updater'
import type { ActionResult, InstitutionSettings, ThemeMode, UpdateStatus } from '../shared/types'
import { getSettings, getSnapshot } from './database'
import {
  addCorrection,
  archiveEmployee,
  closeWeek,
  deleteAbsence,
  deleteClosedDay,
  deleteSegment,
  exportPortableBackup,
  exportStatisticsCsv,
  exportTeamCsv,
  exportWeekPdf,
  importTeamCsv,
  printWeek,
  restorePortableBackup,
  resetApplicationDatabase,
  saveShiftTemplate,
  deleteShiftTemplate,
  saveEmployee,
  saveClosedDay,
  saveSegment,
  setAbsence,
  copyPreviousWeek,
  updateSettings
} from './services'

const { autoUpdater } = electronUpdater

function isTrustedSender(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'file:' || ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && (parsed.protocol === 'http:' || parsed.protocol === 'https:'))
  } catch { return false }
}

function register(channel: string, handler: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!event.senderFrame || !isTrustedSender(event.senderFrame.url)) throw new Error('Nicht vertrauenswürdige IPC-Anfrage wurde blockiert.')
    return handler(...args)
  })
}

function sendChanged(window: BrowserWindow): void {
  if (!window.isDestroyed()) window.webContents.send('event:data-changed')
}

function withRefresh(window: BrowserWindow, action: (...args: any[]) => ActionResult | Promise<ActionResult>) {
  return async (...args: any[]) => {
    const result = await action(...args)
    if (result.ok) sendChanged(window)
    return result
  }
}

export function registerIpc(window: BrowserWindow): void {
  register('app:snapshot', () => getSnapshot(requireVersion()))
  register('team:save', withRefresh(window, saveEmployee))
  register('team:archive', withRefresh(window, archiveEmployee))
  register('team:import-csv', withRefresh(window, importTeamCsv))
  register('team:export-csv', exportTeamCsv)
  register('planning:save-segment', withRefresh(window, saveSegment))
  register('planning:save-template', withRefresh(window, saveShiftTemplate))
  register('planning:delete-template', withRefresh(window, deleteShiftTemplate))
  register('planning:delete-segment', withRefresh(window, deleteSegment))
  register('planning:set-absence', withRefresh(window, setAbsence))
  register('planning:delete-absence', withRefresh(window, deleteAbsence))
  register('planning:copy-week', withRefresh(window, copyPreviousWeek))
  register('time:close-week', withRefresh(window, closeWeek))
  register('time:correction', withRefresh(window, addCorrection))
  register('statistics:export-csv', exportStatisticsCsv)
  register('printing:print-week', printWeek)
  register('printing:export-pdf', exportWeekPdf)
  register('backup:export', exportPortableBackup)
  register('backup:restore', withRefresh(window, restorePortableBackup))
  register('settings:save', withRefresh(window, (settings: InstitutionSettings) => {
    const result = updateSettings(settings)
    if (result.ok) nativeTheme.themeSource = settings.theme
    return result
  }))
  register('settings:closed-day-save', withRefresh(window, saveClosedDay))
  register('settings:closed-day-delete', withRefresh(window, deleteClosedDay))
  register('settings:reset-database', withRefresh(window, resetApplicationDatabase))
  register('theme:set', withRefresh(window, (mode: ThemeMode) => {
    const settings = { ...getSettings(), theme: mode }
    const result = updateSettings(settings)
    if (result.ok) nativeTheme.themeSource = mode
    return result
  }))
  register('updates:check', () => checkForUpdates(window))
  register('updates:install', () => {
    if (updateReady) { setImmediate(() => autoUpdater.quitAndInstall()); return { ok: true, message: 'PlanBär wird neu gestartet und aktualisiert.' } }
    return { ok: false, message: 'Es ist noch kein Update zur Installation bereit.' }
  })
}

let updateReady = false
let updateConfigured = false

function requireVersion(): string {
  return app.getVersion()
}

function publishStatus(window: BrowserWindow, status: UpdateStatus): void {
  if (!window.isDestroyed()) window.webContents.send('event:update-status', status)
}

export function configureUpdates(window: BrowserWindow): void {
  if (updateConfigured || !process.env.NODE_ENV && !window) return
  updateConfigured = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => publishStatus(window, { state: 'checking', message: 'Suche nach Updates …' }))
  autoUpdater.on('update-available', (info) => publishStatus(window, { state: 'downloading', message: `Version ${info.version} wird heruntergeladen …` }))
  autoUpdater.on('download-progress', (progress) => publishStatus(window, { state: 'downloading', message: `Update wird heruntergeladen: ${Math.round(progress.percent)} %`, percent: progress.percent }))
  autoUpdater.on('update-not-available', () => publishStatus(window, { state: 'current', message: 'PlanBär ist aktuell.' }))
  autoUpdater.on('update-downloaded', (info) => { updateReady = true; publishStatus(window, { state: 'ready', message: `Version ${info.version} ist bereit.`, version: info.version }) })
  autoUpdater.on('error', (error) => publishStatus(window, { state: 'error', message: `Updateprüfung fehlgeschlagen: ${error.message}` }))
}

export async function checkForUpdates(window: BrowserWindow): Promise<UpdateStatus> {
  if (!window || window.isDestroyed()) return { state: 'error', message: 'Das Hauptfenster ist nicht verfügbar.' }
  if (!updateConfigured) configureUpdates(window)
  if (!app.isPackaged) return { state: 'current', message: 'Updates werden erst in der installierten App geprüft.' }
  try {
    await autoUpdater.checkForUpdates()
    return { state: 'checking', message: 'Updateprüfung läuft …' }
  } catch (error) {
    return { state: 'error', message: error instanceof Error ? error.message : 'Updateprüfung fehlgeschlagen.' }
  }
}
