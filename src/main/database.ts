import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Holidays from 'date-holidays'
import type {
  Absence,
  AppSnapshot,
  ContractPeriod,
  CustomClosedDay,
  Employee,
  InstitutionSettings,
  LedgerEntry,
  ScheduleSegment,
  ShiftTemplate,
  WeekClosure
} from '../shared/types'

export class AppDatabase {
  private readonly inner: DatabaseSync
  readonly path: string
  open = true

  constructor(path: string, options?: { readonly?: boolean }) {
    this.path = path
    this.inner = new DatabaseSync(path, { readOnly: options?.readonly ?? false })
  }

  prepare(sql: string) { return this.inner.prepare(sql) }
  exec(sql: string): void { this.inner.exec(sql) }
  pragma(statement: string): void { this.inner.exec(`PRAGMA ${statement}`) }
  transaction<T extends unknown[], R>(work: (...args: T) => R) {
    return (...args: T): R => {
      this.inner.exec('BEGIN IMMEDIATE')
      try { const result = work(...args); this.inner.exec('COMMIT'); return result }
      catch (error) { this.inner.exec('ROLLBACK'); throw error }
    }
  }
  async backup(target: string): Promise<void> {
    this.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(this.path, target)
  }
  close(): void { if (this.open) { this.inner.close(); this.open = false } }
}

let db: AppDatabase | undefined
let databasePath = ''

const defaults: InstitutionSettings = {
  institutionName: 'Meine Kindertagesstätte',
  address: '',
  stateCode: 'NW',
  theme: 'system'
}

function migrate(database: AppDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version(version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
  `)
  const version = (database.prepare('SELECT version FROM schema_version').get() as { version: number }).version
  if (version < 1) {
    database.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE employees (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        color TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        weekly_minutes INTEGER NOT NULL,
        mon INTEGER NOT NULL,
        tue INTEGER NOT NULL,
        wed INTEGER NOT NULL,
        thu INTEGER NOT NULL,
        fri INTEGER NOT NULL,
        UNIQUE(employee_id, valid_from)
      );
      CREATE TABLE shift_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        break_minutes INTEGER NOT NULL,
        color TEXT NOT NULL
      );
      CREATE TABLE schedule_segments (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        break_minutes INTEGER NOT NULL,
        actual_start_minute INTEGER,
        actual_end_minute INTEGER,
        actual_break_minutes INTEGER,
        template_id TEXT REFERENCES shift_templates(id) ON DELETE SET NULL,
        notes TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_segments_employee_date ON schedule_segments(employee_id, date);
      CREATE TABLE absences (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('vacation','sick','training')),
        notes TEXT NOT NULL DEFAULT '',
        UNIQUE(employee_id, date)
      );
      CREATE TABLE week_closures (
        week_start TEXT PRIMARY KEY,
        closed_at TEXT NOT NULL
      );
      CREATE TABLE ledger_entries (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        week_start TEXT,
        kind TEXT NOT NULL CHECK(kind IN ('opening','week-close','correction')),
        minutes INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_ledger_week_employee ON ledger_entries(employee_id, week_start, kind) WHERE kind = 'week-close';
      CREATE TABLE custom_closed_days (
        date TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      UPDATE schema_version SET version = 1;
    `)
  }
}

const defaultShiftTemplates = [
  ['Frühdienst', 420, 900, 30, '#2563eb'],
  ['Mitteldienst', 480, 960, 30, '#0f766e'],
  ['Spätdienst', 540, 1020, 30, '#7c3aed']
] as const

function insertDefaultShiftTemplates(database: AppDatabase): void {
  const insert = database.prepare('INSERT INTO shift_templates(id,name,start_minute,end_minute,break_minutes,color) VALUES (?,?,?,?,?,?)')
  defaultShiftTemplates.forEach(([name, start, end, pause, color]) => insert.run(randomUUID(), name, start, end, pause, color))
}

function seed(database: AppDatabase): void {
  const insertSetting = database.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)')
  Object.entries(defaults).forEach(([key, value]) => insertSetting.run(key, value))
  const count = (database.prepare('SELECT COUNT(*) AS count FROM shift_templates').get() as { count: number }).count
  if (!count) insertDefaultShiftTemplates(database)
}

export function resetDatabaseExceptSettings(): void {
  const database = getDatabase()
  database.transaction(() => {
    database.prepare('DELETE FROM audit_events').run()
    database.prepare('DELETE FROM ledger_entries').run()
    database.prepare('DELETE FROM week_closures').run()
    database.prepare('DELETE FROM absences').run()
    database.prepare('DELETE FROM schedule_segments').run()
    database.prepare('DELETE FROM contracts').run()
    database.prepare('DELETE FROM employees').run()
    database.prepare('DELETE FROM custom_closed_days').run()
    database.prepare('DELETE FROM shift_templates').run()
    insertDefaultShiftTemplates(database)
  })()
}

export function initializeDatabase(filePath?: string): AppDatabase {
  databasePath = filePath ?? join(app.getPath('userData'), 'planbaer.sqlite3')
  mkdirSync(dirname(databasePath), { recursive: true })
  if (existsSync(databasePath)) {
    const preMigration = `${databasePath}.pre-migration`
    if (!existsSync(preMigration)) copyFileSync(databasePath, preMigration)
  }
  db = new AppDatabase(databasePath)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  seed(db)
  return db
}

export function getDatabase(): AppDatabase {
  if (!db) throw new Error('Datenbank wurde noch nicht initialisiert.')
  return db
}

export function getDatabasePath(): string {
  return databasePath
}

export function closeDatabase(): void {
  if (db?.open) db.close()
  db = undefined
}

export function reopenDatabase(): void {
  initializeDatabase(databasePath)
}

function rowToContract(row: Record<string, unknown>): ContractPeriod {
  return {
    id: String(row.id), employeeId: String(row.employee_id), validFrom: String(row.valid_from), validTo: row.valid_to ? String(row.valid_to) : null,
    weeklyMinutes: Number(row.weekly_minutes), mon: Number(row.mon), tue: Number(row.tue), wed: Number(row.wed), thu: Number(row.thu), fri: Number(row.fri)
  }
}

function germanHolidays(stateCode: string, years: number[], custom: CustomClosedDay[]): Array<{ date: string; name: string }> {
  const calendar = new Holidays('DE', stateCode)
  const found = years.flatMap((year) => calendar.getHolidays(year))
    .filter((holiday) => holiday.type === 'public')
    .map((holiday) => ({ date: holiday.date.slice(0, 10), name: holiday.name }))
  return [...found, ...custom].filter((item, index, all) => all.findIndex((candidate) => candidate.date === item.date) === index)
}

export function getSettings(): InstitutionSettings {
  const rows = getDatabase().prepare('SELECT key, value FROM settings').all() as Array<{ key: keyof InstitutionSettings; value: string }>
  return { ...defaults, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) } as InstitutionSettings
}

export function saveSettings(settings: InstitutionSettings): void {
  const statement = getDatabase().prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  getDatabase().transaction(() => Object.entries(settings).forEach(([key, value]) => statement.run(key, value)))()
  audit('settings.updated', 'settings', 'institution', settings)
}

export function getSnapshot(appVersion = '0.0.0'): AppSnapshot {
  const database = getDatabase()
  const contractRows = database.prepare('SELECT * FROM contracts ORDER BY valid_from DESC').all() as Array<Record<string, unknown>>
  const contracts = contractRows.map(rowToContract)
  const employees = (database.prepare('SELECT * FROM employees ORDER BY active DESC, last_name, first_name').all() as Array<Record<string, unknown>>).map<Employee>((row) => ({
    id: String(row.id), firstName: String(row.first_name), lastName: String(row.last_name), color: String(row.color), active: Boolean(row.active), createdAt: String(row.created_at),
    contracts: contracts.filter((contract) => contract.employeeId === row.id)
  }))
  const templates = (database.prepare('SELECT * FROM shift_templates ORDER BY start_minute').all() as Array<Record<string, unknown>>).map<ShiftTemplate>((row) => ({
    id: String(row.id), name: String(row.name), startMinute: Number(row.start_minute), endMinute: Number(row.end_minute), breakMinutes: Number(row.break_minutes), color: String(row.color)
  }))
  const segments = (database.prepare('SELECT * FROM schedule_segments ORDER BY date,start_minute').all() as Array<Record<string, unknown>>).map<ScheduleSegment>((row) => ({
    id: String(row.id), employeeId: String(row.employee_id), date: String(row.date), startMinute: Number(row.start_minute), endMinute: Number(row.end_minute), breakMinutes: Number(row.break_minutes),
    actualStartMinute: row.actual_start_minute == null ? null : Number(row.actual_start_minute), actualEndMinute: row.actual_end_minute == null ? null : Number(row.actual_end_minute),
    actualBreakMinutes: row.actual_break_minutes == null ? null : Number(row.actual_break_minutes), templateId: row.template_id ? String(row.template_id) : null, notes: String(row.notes)
  }))
  const absences = database.prepare('SELECT id, employee_id AS employeeId, date, type, notes FROM absences ORDER BY date').all() as unknown as Absence[]
  const closures = database.prepare('SELECT week_start AS weekStart, closed_at AS closedAt FROM week_closures ORDER BY week_start DESC').all() as unknown as WeekClosure[]
  const ledger = database.prepare('SELECT id, employee_id AS employeeId, date, week_start AS weekStart, kind, minutes, reason, created_at AS createdAt FROM ledger_entries ORDER BY date DESC, created_at DESC').all() as unknown as LedgerEntry[]
  const settings = getSettings()
  const customClosedDays = database.prepare('SELECT date, name FROM custom_closed_days ORDER BY date').all() as unknown as CustomClosedDay[]
  const currentYear = new Date().getFullYear()
  const segmentYears = segments.map((segment) => Number(segment.date.slice(0, 4)))
  const holidays = germanHolidays(settings.stateCode, [...new Set([currentYear - 1, currentYear, currentYear + 1, ...segmentYears])], customClosedDays)
  return { employees, templates, segments, absences, closures, ledger, settings, holidays, customClosedDays, appVersion }
}

export function audit(action: string, entityType: string, entityId: string, payload: unknown): void {
  getDatabase().prepare('INSERT INTO audit_events(id,action,entity_type,entity_id,payload,created_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), action, entityType, entityId, JSON.stringify(payload), new Date().toISOString())
}
