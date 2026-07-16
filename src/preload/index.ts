import { contextBridge, ipcRenderer } from 'electron'
import type { PlanBaerApi, UpdateStatus } from '../shared/types'

const api: PlanBaerApi = {
  app: { snapshot: () => ipcRenderer.invoke('app:snapshot') },
  team: {
    save: (input) => ipcRenderer.invoke('team:save', input),
    archive: (id) => ipcRenderer.invoke('team:archive', id),
    importCsv: () => ipcRenderer.invoke('team:import-csv'),
    exportCsv: () => ipcRenderer.invoke('team:export-csv')
  },
  planning: {
    saveTemplate: (input) => ipcRenderer.invoke('planning:save-template', input),
    deleteTemplate: (id) => ipcRenderer.invoke('planning:delete-template', id),
    saveSegment: (input) => ipcRenderer.invoke('planning:save-segment', input),
    deleteSegment: (id) => ipcRenderer.invoke('planning:delete-segment', id),
    setAbsence: (input) => ipcRenderer.invoke('planning:set-absence', input),
    deleteAbsence: (id) => ipcRenderer.invoke('planning:delete-absence', id),
    copyPreviousWeek: (weekStart) => ipcRenderer.invoke('planning:copy-week', weekStart)
  },
  time: {
    closeWeek: (weekStart) => ipcRenderer.invoke('time:close-week', weekStart),
    addCorrection: (input) => ipcRenderer.invoke('time:correction', input)
  },
  statistics: { exportCsv: (from, to) => ipcRenderer.invoke('statistics:export-csv', from, to) },
  printing: {
    printWeek: (weekStart) => ipcRenderer.invoke('printing:print-week', weekStart),
    exportPdf: (weekStart) => ipcRenderer.invoke('printing:export-pdf', weekStart)
  },
  backup: {
    export: (passphrase) => ipcRenderer.invoke('backup:export', passphrase),
    restore: (passphrase) => ipcRenderer.invoke('backup:restore', passphrase)
  },
  settings: {
    save: (input) => ipcRenderer.invoke('settings:save', input),
    saveClosedDay: (input) => ipcRenderer.invoke('settings:closed-day-save', input),
    deleteClosedDay: (date) => ipcRenderer.invoke('settings:closed-day-delete', date),
    resetDatabase: () => ipcRenderer.invoke('settings:reset-database')
  },
  theme: { set: (mode) => ipcRenderer.invoke('theme:set', mode) },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install')
  },
  events: {
    onDataChanged: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('event:data-changed', listener)
      return () => ipcRenderer.removeListener('event:data-changed', listener)
    },
    onUpdateStatus: (callback) => {
      const listener = (_event: unknown, status: UpdateStatus) => callback(status)
      ipcRenderer.on('event:update-status', listener)
      return () => ipcRenderer.removeListener('event:update-status', listener)
    }
  }
}

contextBridge.exposeInMainWorld('planBaer', api)
