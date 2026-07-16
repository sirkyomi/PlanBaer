import { BrowserWindow, app, dialog, safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Papa from 'papaparse'
import { DatabaseSync } from 'node:sqlite'
import type { AbsenceInput, ActionResult, CorrectionInput, CustomClosedDay, EmployeeInput, InstitutionSettings, SegmentInput, ShiftTemplateInput } from '../shared/types'
import { absenceInputSchema, closedDaySchema, correctionInputSchema, dateRangeSchema, employeeInputSchema, idSchema, segmentInputSchema, settingsSchema, shiftTemplateInputSchema, weekStartSchema } from '../shared/schemas'
import { addIsoDays, employeeVisibleInWeek, employeeWeekMetrics, getWeekDates, getWeekStart, minuteToTime, segmentMinutes, targetMinutes } from '../shared/time'
import { audit, closeDatabase, getDatabase, getDatabasePath, getSettings, getSnapshot, reopenDatabase, resetDatabaseExceptSettings, saveSettings as persistSettings } from './database'

function ok(message: string, count?: number): ActionResult { return { ok: true, message, count } }
function fail(error: unknown): ActionResult { return { ok: false, message: error instanceof Error ? error.message : 'Die Aktion konnte nicht ausgeführt werden.' } }
function assertWeekOpen(date: string): void {
  const week = getWeekStart(date)
  if (getDatabase().prepare('SELECT 1 FROM week_closures WHERE week_start=?').get(week)) throw new Error('Diese Woche ist abgeschlossen und kann nicht mehr bearbeitet werden.')
}

export function saveEmployee(raw: EmployeeInput): ActionResult {
  try {
    const input = employeeInputSchema.parse(raw)
    const database = getDatabase()
    const id = input.id ?? randomUUID()
    const isNew = !input.id
    database.transaction(() => {
      database.prepare(`INSERT INTO employees(id,first_name,last_name,color,active,created_at) VALUES (?,?,?,?,1,?)
        ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,color=excluded.color,active=1`)
        .run(id, input.firstName, input.lastName, input.color, new Date().toISOString())
      const existing = database.prepare('SELECT id FROM contracts WHERE employee_id=? AND valid_from=?').get(id, input.validFrom) as { id: string } | undefined
      if (existing) {
        database.prepare('UPDATE contracts SET weekly_minutes=?,mon=?,tue=?,wed=?,thu=?,fri=? WHERE id=?')
          .run(input.weeklyMinutes, input.dayProfile.mon, input.dayProfile.tue, input.dayProfile.wed, input.dayProfile.thu, input.dayProfile.fri, existing.id)
      } else {
        database.prepare('UPDATE contracts SET valid_to=? WHERE employee_id=? AND valid_to IS NULL AND valid_from < ?')
          .run(addIsoDays(input.validFrom, -1), id, input.validFrom)
        database.prepare('INSERT INTO contracts(id,employee_id,valid_from,valid_to,weekly_minutes,mon,tue,wed,thu,fri) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(), id, input.validFrom, null, input.weeklyMinutes, input.dayProfile.mon, input.dayProfile.tue, input.dayProfile.wed, input.dayProfile.thu, input.dayProfile.fri)
      }
      if (isNew && input.openingBalanceMinutes) {
        database.prepare('INSERT INTO ledger_entries(id,employee_id,date,week_start,kind,minutes,reason,created_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(randomUUID(), id, input.validFrom, null, 'opening', input.openingBalanceMinutes, 'Übernommener Startsaldo', new Date().toISOString())
      }
      audit(isNew ? 'employee.created' : 'employee.updated', 'employee', id, input)
    })()
    return ok(isNew ? 'Mitarbeitende Person wurde angelegt.' : 'Mitarbeitende Person wurde aktualisiert.')
  } catch (error) { return fail(error) }
}

export function archiveEmployee(rawId: string): ActionResult {
  try {
    const id = idSchema.parse(rawId)
    getDatabase().prepare('UPDATE employees SET active=0 WHERE id=?').run(id)
    audit('employee.archived', 'employee', id, {})
    return ok('Die Person wurde archiviert. Historische Daten bleiben erhalten.')
  } catch (error) { return fail(error) }
}

export function saveShiftTemplate(raw: ShiftTemplateInput): ActionResult {
  try {
    const input = shiftTemplateInputSchema.parse(raw)
    const database = getDatabase()
    const id = input.id ?? randomUUID()
    database.prepare(`INSERT INTO shift_templates(id,name,start_minute,end_minute,break_minutes,color) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,start_minute=excluded.start_minute,end_minute=excluded.end_minute,break_minutes=excluded.break_minutes,color=excluded.color`)
      .run(id, input.name, input.startMinute, input.endMinute, input.breakMinutes, input.color)
    audit(input.id ? 'shift_template.updated' : 'shift_template.created', 'shift_template', id, input)
    return ok(input.id ? 'Schichtvorlage wurde aktualisiert.' : 'Schichtvorlage wurde angelegt.')
  } catch (error) { return fail(error) }
}

export function deleteShiftTemplate(rawId: string): ActionResult {
  try {
    const id = idSchema.parse(rawId)
    const database = getDatabase()
    const count = (database.prepare('SELECT COUNT(*) AS count FROM shift_templates').get() as { count: number }).count
    if (count <= 1) return fail(new Error('Mindestens eine Schichtvorlage muss erhalten bleiben.'))
    const result = database.prepare('DELETE FROM shift_templates WHERE id=?').run(id)
    if (!result.changes) return ok('Die Schichtvorlage war bereits gelöscht.')
    audit('shift_template.deleted', 'shift_template', id, {})
    return ok('Schichtvorlage wurde gelöscht. Bestehende Dienstplaneinträge bleiben erhalten.')
  } catch (error) { return fail(error) }
}

export function saveSegment(raw: SegmentInput): ActionResult {
  try {
    const input = segmentInputSchema.parse(raw)
    assertWeekOpen(input.date)
    const database = getDatabase()
    const id = input.id ?? randomUUID()
    const overlap = database.prepare(`SELECT 1 FROM schedule_segments WHERE employee_id=? AND date=? AND id<>?
      AND start_minute < ? AND ? < end_minute`).get(input.employeeId, input.date, id, input.endMinute, input.startMinute)
    database.prepare(`INSERT INTO schedule_segments(id,employee_id,date,start_minute,end_minute,break_minutes,actual_start_minute,actual_end_minute,actual_break_minutes,template_id,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,date=excluded.date,start_minute=excluded.start_minute,end_minute=excluded.end_minute,
      break_minutes=excluded.break_minutes,actual_start_minute=excluded.actual_start_minute,actual_end_minute=excluded.actual_end_minute,actual_break_minutes=excluded.actual_break_minutes,
      template_id=excluded.template_id,notes=excluded.notes`)
      .run(id, input.employeeId, input.date, input.startMinute, input.endMinute, input.breakMinutes, input.actualStartMinute ?? null, input.actualEndMinute ?? null, input.actualBreakMinutes ?? null, input.templateId ?? null, input.notes ?? '')
    getDatabase().prepare('DELETE FROM absences WHERE employee_id=? AND date=?').run(input.employeeId, input.date)
    audit(input.id ? 'segment.updated' : 'segment.created', 'schedule_segment', id, input)
    return ok(overlap ? 'Schicht gespeichert. Hinweis: Sie überschneidet sich mit einer weiteren Schicht.' : 'Schicht wurde gespeichert.')
  } catch (error) { return fail(error) }
}

export function deleteSegment(rawId: string): ActionResult {
  try {
    const id = idSchema.parse(rawId)
    const segment = getDatabase().prepare('SELECT date FROM schedule_segments WHERE id=?').get(id) as { date: string } | undefined
    if (!segment) return ok('Die Schicht war bereits gelöscht.')
    assertWeekOpen(segment.date)
    getDatabase().prepare('DELETE FROM schedule_segments WHERE id=?').run(id)
    audit('segment.deleted', 'schedule_segment', id, {})
    return ok('Schicht wurde gelöscht.')
  } catch (error) { return fail(error) }
}

export function setAbsence(raw: AbsenceInput): ActionResult {
  try {
    const input = absenceInputSchema.parse(raw)
    assertWeekOpen(input.date)
    const database = getDatabase()
    const id = input.id ?? randomUUID()
    database.transaction(() => {
      database.prepare('DELETE FROM schedule_segments WHERE employee_id=? AND date=?').run(input.employeeId, input.date)
      database.prepare(`INSERT INTO absences(id,employee_id,date,type,notes) VALUES (?,?,?,?,?)
        ON CONFLICT(employee_id,date) DO UPDATE SET type=excluded.type,notes=excluded.notes`)
        .run(id, input.employeeId, input.date, input.type, input.notes ?? '')
      audit('absence.saved', 'absence', id, input)
    })()
    return ok('Abwesenheit wurde eingetragen; vorhandene Schichten an diesem Tag wurden entfernt.')
  } catch (error) { return fail(error) }
}

export function deleteAbsence(rawId: string): ActionResult {
  try {
    const id = idSchema.parse(rawId)
    const absence = getDatabase().prepare('SELECT date FROM absences WHERE id=?').get(id) as { date: string } | undefined
    if (!absence) return ok('Die Abwesenheit war bereits gelöscht.')
    assertWeekOpen(absence.date)
    getDatabase().prepare('DELETE FROM absences WHERE id=?').run(id)
    audit('absence.deleted', 'absence', id, {})
    return ok('Abwesenheit wurde entfernt.')
  } catch (error) { return fail(error) }
}

export function copyPreviousWeek(rawWeekStart: string): ActionResult {
  try {
    const weekStart = weekStartSchema.parse(rawWeekStart)
    assertWeekOpen(weekStart)
    const previous = addIsoDays(weekStart, -7)
    const previousDates = getWeekDates(previous)
    const database = getDatabase()
    let count = 0
    database.transaction(() => {
      const segments = database.prepare(`SELECT * FROM schedule_segments WHERE date BETWEEN ? AND ?`).all(previousDates[0], previousDates[4]) as Array<Record<string, unknown>>
      for (const row of segments) {
        const targetDate = addIsoDays(String(row.date), 7)
        const employeeId = String(row.employee_id)
        const startMinute = Number(row.start_minute)
        const exists = database.prepare('SELECT 1 FROM schedule_segments WHERE employee_id=? AND date=? AND start_minute=?').get(employeeId, targetDate, startMinute)
        if (!exists) {
          database.prepare(`INSERT INTO schedule_segments(id,employee_id,date,start_minute,end_minute,break_minutes,actual_start_minute,actual_end_minute,actual_break_minutes,template_id,notes)
            VALUES (?,?,?,?,?,?,NULL,NULL,NULL,?,?)`).run(randomUUID(), employeeId, targetDate, startMinute, Number(row.end_minute), Number(row.break_minutes), row.template_id == null ? null : String(row.template_id), String(row.notes ?? ''))
          count++
        }
      }
    })()
    audit('week.copied', 'week', weekStart, { from: previous, count })
    return ok(count ? `${count} Schichten aus der Vorwoche wurden übernommen.` : 'Es gab keine neuen Schichten zum Übernehmen.', count)
  } catch (error) { return fail(error) }
}

export function closeWeek(rawWeekStart: string): ActionResult {
  try {
    const weekStart = weekStartSchema.parse(rawWeekStart)
    const database = getDatabase()
    if (database.prepare('SELECT 1 FROM week_closures WHERE week_start=?').get(weekStart)) return fail(new Error('Diese Woche ist bereits abgeschlossen.'))
    const snapshot = getSnapshot(app.getVersion())
    const employees = snapshot.employees.filter((employee) => employeeVisibleInWeek(employee, weekStart))
    database.transaction(() => {
      for (const employee of employees) {
        const metrics = employeeWeekMetrics(snapshot, employee, weekStart)
        database.prepare('INSERT INTO ledger_entries(id,employee_id,date,week_start,kind,minutes,reason,created_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(randomUUID(), employee.id, addIsoDays(weekStart, 4), weekStart, 'week-close', metrics.delta, `Wochenabschluss ${weekStart}`, new Date().toISOString())
      }
      database.prepare('INSERT INTO week_closures(week_start,closed_at) VALUES (?,?)').run(weekStart, new Date().toISOString())
      audit('week.closed', 'week', weekStart, { employees: employees.length })
    })()
    return ok(`Woche abgeschlossen. Für ${employees.length} Personen wurden Salden gebucht.`, employees.length)
  } catch (error) { return fail(error) }
}

export function addCorrection(raw: CorrectionInput): ActionResult {
  try {
    const input = correctionInputSchema.parse(raw)
    const id = randomUUID()
    getDatabase().prepare('INSERT INTO ledger_entries(id,employee_id,date,week_start,kind,minutes,reason,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, input.employeeId, input.date, null, 'correction', input.minutes, input.reason, new Date().toISOString())
    audit('ledger.corrected', 'ledger_entry', id, input)
    return ok('Korrektur wurde revisionssicher gebucht.')
  } catch (error) { return fail(error) }
}

export function updateSettings(raw: InstitutionSettings): ActionResult {
  try {
    persistSettings(settingsSchema.parse(raw))
    return ok('Einstellungen wurden gespeichert.')
  } catch (error) { return fail(error) }
}

export function saveClosedDay(raw: CustomClosedDay): ActionResult {
  try {
    const input = closedDaySchema.parse(raw)
    getDatabase().prepare(`INSERT INTO custom_closed_days(date,name) VALUES (?,?)
      ON CONFLICT(date) DO UPDATE SET name=excluded.name`).run(input.date, input.name)
    audit('closed-day.saved', 'custom_closed_day', input.date, input)
    return ok('Schließtag wurde gespeichert.')
  } catch (error) { return fail(error) }
}

export function deleteClosedDay(rawDate: string): ActionResult {
  try {
    const date = closedDaySchema.shape.date.parse(rawDate)
    getDatabase().prepare('DELETE FROM custom_closed_days WHERE date=?').run(date)
    audit('closed-day.deleted', 'custom_closed_day', date, {})
    return ok('Schließtag wurde entfernt.')
  } catch (error) { return fail(error) }
}

export function resetApplicationDatabase(): ActionResult {
  try {
    resetDatabaseExceptSettings()
    return ok('Datenbank wurde zurückgesetzt. Die Einstellungen wurden beibehalten.')
  } catch (error) { return fail(error) }
}

function employeeRows() {
  return getSnapshot(app.getVersion()).employees.map((employee) => {
    const contract = employee.contracts[0]
    return {
      Vorname: employee.firstName, Nachname: employee.lastName, Aktiv: employee.active ? 'ja' : 'nein', Vertragsbeginn: contract?.validFrom ?? '',
      Wochenstunden: contract ? contract.weeklyMinutes / 60 : 0, Montag: (contract?.mon ?? 0) / 60, Dienstag: (contract?.tue ?? 0) / 60,
      Mittwoch: (contract?.wed ?? 0) / 60, Donnerstag: (contract?.thu ?? 0) / 60, Freitag: (contract?.fri ?? 0) / 60
    }
  })
}

export async function exportTeamCsv(): Promise<ActionResult> {
  try {
    const result = await dialog.showSaveDialog({ title: 'Team als CSV exportieren', defaultPath: 'PlanBaer-Team.csv', filters: [{ name: 'CSV-Datei', extensions: ['csv'] }] })
    if (result.canceled || !result.filePath) return ok('Export wurde abgebrochen.')
    writeFileSync(result.filePath, `\uFEFF${Papa.unparse(employeeRows(), { delimiter: ';' })}`, 'utf8')
    return ok('Teamdaten wurden exportiert.')
  } catch (error) { return fail(error) }
}

function hoursToMinutes(value: unknown): number { return Math.round(Number(String(value ?? '0').replace(',', '.')) * 60) }

export async function importTeamCsv(): Promise<ActionResult> {
  try {
    const result = await dialog.showOpenDialog({ title: 'Team aus CSV importieren', properties: ['openFile'], filters: [{ name: 'CSV-Datei', extensions: ['csv'] }] })
    if (result.canceled || !result.filePaths[0]) return ok('Import wurde abgebrochen.')
    const parsed = Papa.parse<Record<string, string>>(readFileSync(result.filePaths[0], 'utf8').replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true, delimiter: '' })
    if (parsed.errors.length) throw new Error(`CSV konnte nicht gelesen werden: ${parsed.errors[0].message}`)
    let count = 0
    for (const row of parsed.data) {
      const dayProfile = { mon: hoursToMinutes(row.Montag), tue: hoursToMinutes(row.Dienstag), wed: hoursToMinutes(row.Mittwoch), thu: hoursToMinutes(row.Donnerstag), fri: hoursToMinutes(row.Freitag) }
      const result = saveEmployee({ firstName: row.Vorname, lastName: row.Nachname, color: '#2563eb', validFrom: row.Vertragsbeginn || new Date().toISOString().slice(0, 10), weeklyMinutes: hoursToMinutes(row.Wochenstunden), dayProfile })
      if (!result.ok) throw new Error(`Zeile ${count + 2}: ${result.message}`)
      count++
    }
    return ok(`${count} Personen wurden importiert.`, count)
  } catch (error) { return fail(error) }
}

export async function exportStatisticsCsv(fromRaw: string, toRaw: string): Promise<ActionResult> {
  try {
    const { from, to } = dateRangeSchema.parse({ from: fromRaw, to: toRaw })
    const snapshot = getSnapshot(app.getVersion())
    const rows = snapshot.employees.map((employee) => {
      const segments = snapshot.segments.filter((segment) => segment.employeeId === employee.id && segment.date >= from && segment.date <= to)
      const absences = snapshot.absences.filter((absence) => absence.employeeId === employee.id && absence.date >= from && absence.date <= to)
      let target = 0
      for (let date = from; date <= to; date = addIsoDays(date, 1)) target += targetMinutes(employee, date, snapshot)
      const planned = segments.reduce((sum, segment) => sum + segmentMinutes(segment), 0)
      const actual = segments.reduce((sum, segment) => sum + segmentMinutes(segment, true), 0) + absences.reduce((sum, absence) => sum + targetMinutes(employee, absence.date, snapshot), 0)
      const balance = snapshot.ledger.filter((entry) => entry.employeeId === employee.id && entry.date >= from && entry.date <= to).reduce((sum, entry) => sum + entry.minutes, 0)
      return { Mitarbeitende: `${employee.firstName} ${employee.lastName}`, Sollstunden: (target / 60).toFixed(2), Planstunden: (planned / 60).toFixed(2), Iststunden: (actual / 60).toFixed(2), Differenzstunden: ((actual - target) / 60).toFixed(2), Saldoveraenderung: (balance / 60).toFixed(2), Abwesenheitstage: absences.length }
    })
    const result = await dialog.showSaveDialog({ title: 'Statistik als CSV exportieren', defaultPath: `PlanBaer-Statistik-${from}-${to}.csv`, filters: [{ name: 'CSV-Datei', extensions: ['csv'] }] })
    if (result.canceled || !result.filePath) return ok('Export wurde abgebrochen.')
    writeFileSync(result.filePath, `\uFEFF${Papa.unparse(rows, { delimiter: ';' })}`, 'utf8')
    return ok('Statistik wurde exportiert.')
  } catch (error) { return fail(error) }
}

function encryptBuffer(data: Buffer, passphrase: string) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(passphrase, salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  return { format: 'planbaer-backup', version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }
}

function decryptBackup(payload: Record<string, unknown>, passphrase: string): Buffer {
  if (payload.format !== 'planbaer-backup' || payload.version !== 1) throw new Error('Dieses Backupformat wird nicht unterstützt.')
  const salt = Buffer.from(String(payload.salt), 'base64')
  const iv = Buffer.from(String(payload.iv), 'base64')
  const key = scryptSync(passphrase, salt, 32)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(Buffer.from(String(payload.tag), 'base64'))
  try { return Buffer.concat([decipher.update(Buffer.from(String(payload.data), 'base64')), decipher.final()]) }
  catch { throw new Error('Das Passwort ist falsch oder das Backup wurde beschädigt.') }
}

export async function exportPortableBackup(passphrase: string): Promise<ActionResult> {
  try {
    if (passphrase.length < 8) throw new Error('Das Backup-Passwort muss mindestens acht Zeichen lang sein.')
    const result = await dialog.showSaveDialog({ title: 'Verschlüsseltes Backup speichern', defaultPath: `PlanBaer-${new Date().toISOString().slice(0, 10)}.planbaer-backup`, filters: [{ name: 'PlanBär-Backup', extensions: ['planbaer-backup'] }] })
    if (result.canceled || !result.filePath) return ok('Backup wurde abgebrochen.')
    const temp = join(tmpdir(), `planbaer-${randomUUID()}.sqlite3`)
    await getDatabase().backup(temp)
    writeFileSync(result.filePath, JSON.stringify(encryptBuffer(readFileSync(temp), passphrase)))
    unlinkSync(temp)
    audit('backup.exported', 'backup', result.filePath, {})
    return ok('Das verschlüsselte Backup wurde gespeichert.')
  } catch (error) { return fail(error) }
}

export async function restorePortableBackup(passphrase: string): Promise<ActionResult> {
  try {
    const result = await dialog.showOpenDialog({ title: 'PlanBär-Backup wiederherstellen', properties: ['openFile'], filters: [{ name: 'PlanBär-Backup', extensions: ['planbaer-backup'] }] })
    if (result.canceled || !result.filePaths[0]) return ok('Wiederherstellung wurde abgebrochen.')
    const decrypted = decryptBackup(JSON.parse(readFileSync(result.filePaths[0], 'utf8')) as Record<string, unknown>, passphrase)
    const temp = join(tmpdir(), `planbaer-restore-${randomUUID()}.sqlite3`)
    writeFileSync(temp, decrypted)
    const check = new DatabaseSync(temp, { readOnly: true })
    const version = check.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
    check.close()
    if (!version?.version) throw new Error('Das Backup enthält keine gültige PlanBär-Datenbank.')
    const current = getDatabasePath()
    const safety = `${current}.before-restore-${Date.now()}`
    getDatabase().pragma('wal_checkpoint(TRUNCATE)')
    closeDatabase()
    copyFileSync(current, safety)
    copyFileSync(temp, current)
    rmSync(`${current}-wal`, { force: true })
    rmSync(`${current}-shm`, { force: true })
    reopenDatabase()
    unlinkSync(temp)
    return ok('Backup wurde wiederhergestellt. Die vorherige Datenbank wurde zusätzlich gesichert.')
  } catch (error) {
    try { if (!getDatabase().open) reopenDatabase() } catch { /* main process reports original error */ }
    return fail(error)
  }
}

export async function createEncryptedLocalSnapshot(): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) return
  const directory = join(app.getPath('userData'), 'backups')
  mkdirSync(directory, { recursive: true })
  const keyFile = join(directory, '.key')
  let key: string
  if (existsSync(keyFile)) key = safeStorage.decryptString(readFileSync(keyFile))
  else {
    key = randomBytes(32).toString('base64')
    writeFileSync(keyFile, safeStorage.encryptString(key))
  }
  const temp = join(tmpdir(), `planbaer-local-${randomUUID()}.sqlite3`)
  await getDatabase().backup(temp)
  const target = join(directory, `auto-${new Date().toISOString().replace(/[:.]/g, '-')}.planbaer-backup`)
  writeFileSync(target, JSON.stringify(encryptBuffer(readFileSync(temp), key)))
  unlinkSync(temp)
  const files = readdirSync(directory).filter((name) => name.endsWith('.planbaer-backup')).map((name) => join(directory, name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  files.slice(7).forEach((file) => unlinkSync(file))
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!) }

function printHtml(weekStart: string): string {
  const snapshot = getSnapshot(app.getVersion())
  const dates = getWeekDates(weekStart)
  const labels = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
  const rows = snapshot.employees.filter((employee) => employee.active).map((employee) => {
    const cells = dates.map((date) => {
      const absence = snapshot.absences.find((item) => item.employeeId === employee.id && item.date === date)
      const holiday = snapshot.holidays.find((item) => item.date === date)
      if (holiday) return `<td><strong>${escapeHtml(holiday.name)}</strong></td>`
      if (absence) return `<td class="absence ${absence.type}">${absence.type === 'vacation' ? 'Urlaub' : absence.type === 'sick' ? 'Krank' : 'Fortbildung'}</td>`
      const shifts = snapshot.segments.filter((segment) => segment.employeeId === employee.id && segment.date === date)
      return `<td>${shifts.map((segment) => `<div>${minuteToTime(segment.startMinute)}–${minuteToTime(segment.endMinute)}<small> · ${segment.breakMinutes} Min. Pause</small></div>`).join('') || '—'}</td>`
    }).join('')
    return `<tr><th>${escapeHtml(employee.lastName)}, ${escapeHtml(employee.firstName)}</th>${cells}</tr>`
  }).join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>PlanBär Dienstplan</title><style>
    @page { size: A4 landscape; margin: 10mm; } *{box-sizing:border-box} body{font-family:"Segoe UI",sans-serif;color:#14213d;margin:0;font-size:10pt}
    header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8mm} h1{font-size:20pt;margin:0;color:#1d4ed8} p{margin:2px 0;color:#475569}
    table{border-collapse:collapse;width:100%;table-layout:fixed} thead{display:table-header-group} th,td{border:1px solid #cbd5e1;padding:5px;vertical-align:top;page-break-inside:avoid}
    thead th{background:#e8f0ff;text-align:left} tbody th{width:18%;text-align:left;background:#f8fafc} td{height:12mm}.absence{font-weight:600}.vacation{color:#166534}.sick{color:#b91c1c}.training{color:#6d28d9}small{color:#64748b}
    footer{margin-top:5mm;display:flex;gap:14px;color:#64748b;font-size:8pt}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:3px}
  </style></head><body><header><div><h1>${escapeHtml(snapshot.settings.institutionName)}</h1><p>Dienstplan · Woche vom ${dates[0].split('-').reverse().join('.')} bis ${dates[4].split('-').reverse().join('.')}</p></div><p>Erstellt: ${new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date())}</p></header>
  <table><thead><tr><th>Mitarbeitende</th>${dates.map((date, i) => `<th>${labels[i]}<br><small>${date.slice(8,10)}.${date.slice(5,7)}.</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <footer><span><i class="dot" style="background:#16a34a"></i>Urlaub</span><span><i class="dot" style="background:#dc2626"></i>Krank</span><span><i class="dot" style="background:#7c3aed"></i>Fortbildung</span><span>PlanBär ${escapeHtml(snapshot.appVersion)}</span></footer></body></html>`
}

async function createPrintWindow(weekStart: string): Promise<{ window: BrowserWindow; file: string }> {
  const file = join(tmpdir(), `planbaer-print-${Date.now()}.html`)
  writeFileSync(file, printHtml(weekStart), 'utf8')
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  await window.loadFile(file)
  return { window, file }
}

export async function printWeek(rawWeekStart: string): Promise<ActionResult> {
  try {
    const weekStart = weekStartSchema.parse(rawWeekStart)
    const target = await createPrintWindow(weekStart)
    const success = await new Promise<boolean>((resolve) => target.window.webContents.print({ silent: false, printBackground: true, landscape: true }, resolve))
    target.window.destroy(); unlinkSync(target.file)
    return success ? ok('Der Dienstplan wurde an den Druckdialog übergeben.') : fail(new Error('Der Druck wurde abgebrochen oder ist fehlgeschlagen.'))
  } catch (error) { return fail(error) }
}

export async function exportWeekPdf(rawWeekStart: string): Promise<ActionResult> {
  try {
    const weekStart = weekStartSchema.parse(rawWeekStart)
    const result = await dialog.showSaveDialog({ title: 'Dienstplan als PDF speichern', defaultPath: `PlanBaer-Dienstplan-${weekStart}.pdf`, filters: [{ name: 'PDF-Datei', extensions: ['pdf'] }] })
    if (result.canceled || !result.filePath) return ok('PDF-Export wurde abgebrochen.')
    const target = await createPrintWindow(weekStart)
    const pdf = await target.window.webContents.printToPDF({ landscape: true, pageSize: 'A4', printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true })
    writeFileSync(result.filePath, pdf)
    target.window.destroy(); unlinkSync(target.file)
    return ok('Dienstplan wurde als PDF gespeichert.')
  } catch (error) { return fail(error) }
}
