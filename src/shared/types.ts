export type ThemeMode = 'system' | 'light' | 'dark'
export type AbsenceType = 'vacation' | 'sick' | 'training'
export type LedgerKind = 'opening' | 'week-close' | 'correction'

export interface DayProfile {
  mon: number
  tue: number
  wed: number
  thu: number
  fri: number
}

export interface ContractPeriod extends DayProfile {
  id: string
  employeeId: string
  validFrom: string
  validTo: string | null
  weeklyMinutes: number
}

export interface Employee {
  id: string
  firstName: string
  lastName: string
  color: string
  active: boolean
  createdAt: string
  contracts: ContractPeriod[]
}

export interface ShiftTemplate {
  id: string
  name: string
  startMinute: number
  endMinute: number
  breakMinutes: number
  color: string
}

export interface ShiftTemplateInput {
  id?: string
  name: string
  startMinute: number
  endMinute: number
  breakMinutes: number
  color: string
}

export interface ScheduleSegment {
  id: string
  employeeId: string
  date: string
  startMinute: number
  endMinute: number
  breakMinutes: number
  actualStartMinute: number | null
  actualEndMinute: number | null
  actualBreakMinutes: number | null
  templateId: string | null
  notes: string
}

export interface Absence {
  id: string
  employeeId: string
  date: string
  type: AbsenceType
  notes: string
}

export interface WeekClosure {
  weekStart: string
  closedAt: string
}

export interface LedgerEntry {
  id: string
  employeeId: string
  date: string
  weekStart: string | null
  kind: LedgerKind
  minutes: number
  reason: string
  createdAt: string
}

export interface Holiday {
  date: string
  name: string
}

export interface CustomClosedDay {
  date: string
  name: string
}

export interface InstitutionSettings {
  institutionName: string
  address: string
  stateCode: string
  theme: ThemeMode
}

export interface AppSnapshot {
  employees: Employee[]
  templates: ShiftTemplate[]
  segments: ScheduleSegment[]
  absences: Absence[]
  closures: WeekClosure[]
  ledger: LedgerEntry[]
  holidays: Holiday[]
  customClosedDays: CustomClosedDay[]
  settings: InstitutionSettings
  appVersion: string
}

export interface EmployeeInput {
  id?: string
  firstName: string
  lastName: string
  color: string
  validFrom: string
  weeklyMinutes: number
  dayProfile: DayProfile
  openingBalanceMinutes?: number
}

export interface SegmentInput {
  id?: string
  employeeId: string
  date: string
  startMinute: number
  endMinute: number
  breakMinutes: number
  actualStartMinute?: number | null
  actualEndMinute?: number | null
  actualBreakMinutes?: number | null
  templateId?: string | null
  notes?: string
}

export interface AbsenceInput {
  id?: string
  employeeId: string
  date: string
  type: AbsenceType
  notes?: string
}

export interface CorrectionInput {
  employeeId: string
  date: string
  minutes: number
  reason: string
}

export interface ActionResult {
  ok: boolean
  message: string
  count?: number
}

export type UpdateStatus =
  | { state: 'idle'; message: string }
  | { state: 'checking' | 'downloading'; message: string; percent?: number }
  | { state: 'ready'; message: string; version: string }
  | { state: 'current' | 'error'; message: string }

export interface PlanBaerApi {
  app: { snapshot: () => Promise<AppSnapshot> }
  team: {
    save: (input: EmployeeInput) => Promise<ActionResult>
    archive: (id: string) => Promise<ActionResult>
    importCsv: () => Promise<ActionResult>
    exportCsv: () => Promise<ActionResult>
  }
  planning: {
    saveTemplate: (input: ShiftTemplateInput) => Promise<ActionResult>
    deleteTemplate: (id: string) => Promise<ActionResult>
    saveSegment: (input: SegmentInput) => Promise<ActionResult>
    deleteSegment: (id: string) => Promise<ActionResult>
    setAbsence: (input: AbsenceInput) => Promise<ActionResult>
    deleteAbsence: (id: string) => Promise<ActionResult>
    copyPreviousWeek: (weekStart: string) => Promise<ActionResult>
  }
  time: {
    closeWeek: (weekStart: string) => Promise<ActionResult>
    addCorrection: (input: CorrectionInput) => Promise<ActionResult>
  }
  statistics: { exportCsv: (from: string, to: string) => Promise<ActionResult> }
  printing: { printWeek: (weekStart: string) => Promise<ActionResult>; exportPdf: (weekStart: string) => Promise<ActionResult> }
  backup: { export: (passphrase: string) => Promise<ActionResult>; restore: (passphrase: string) => Promise<ActionResult> }
  settings: {
    save: (input: InstitutionSettings) => Promise<ActionResult>
    saveClosedDay: (input: CustomClosedDay) => Promise<ActionResult>
    deleteClosedDay: (date: string) => Promise<ActionResult>
    resetDatabase: () => Promise<ActionResult>
  }
  theme: { set: (mode: ThemeMode) => Promise<ActionResult> }
  updates: { check: () => Promise<UpdateStatus>; install: () => Promise<ActionResult> }
  events: {
    onDataChanged: (callback: () => void) => () => void
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
  }
}
