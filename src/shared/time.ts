import type { AppSnapshot, ContractPeriod, Employee, ScheduleSegment } from './types'

const keys = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

export function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`)
}

export function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function addIsoDays(value: string, days: number): string {
  const date = dateFromIso(value)
  date.setDate(date.getDate() + days)
  return isoFromDate(date)
}

export function getWeekStart(value = isoFromDate(new Date())): string {
  const date = dateFromIso(value)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return isoFromDate(date)
}

export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 5 }, (_, index) => addIsoDays(weekStart, index))
}

export function minuteToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export function timeToMinute(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatDuration(value: number, signed = false): string {
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : ''
  const absolute = Math.abs(value)
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, '0')} h`
}

export function segmentMinutes(segment: ScheduleSegment, actual = false): number {
  const start = actual && segment.actualStartMinute != null ? segment.actualStartMinute : segment.startMinute
  const end = actual && segment.actualEndMinute != null ? segment.actualEndMinute : segment.endMinute
  const pause = actual && segment.actualBreakMinutes != null ? segment.actualBreakMinutes : segment.breakMinutes
  return Math.max(0, end - start - pause)
}

export function contractOn(employee: Employee, date: string): ContractPeriod | undefined {
  return employee.contracts
    .filter((contract) => contract.validFrom <= date && (!contract.validTo || contract.validTo >= date))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
}

export function employeeVisibleInWeek(employee: Employee, weekStart: string, today = isoFromDate(new Date())): boolean {
  if (employee.active) return true
  const weekEnd = addIsoDays(weekStart, 4)
  if (weekEnd >= today) return false
  return employee.contracts.some((contract) => contract.validFrom <= weekEnd && (!contract.validTo || contract.validTo >= weekStart))
}

export function targetMinutes(employee: Employee, date: string, snapshot?: Pick<AppSnapshot, 'holidays'>): number {
  if (snapshot?.holidays.some((holiday) => holiday.date === date)) return 0
  const contract = contractOn(employee, date)
  if (!contract) return 0
  const weekday = dateFromIso(date).getDay()
  if (weekday < 1 || weekday > 5) return 0
  return contract[keys[weekday - 1]]
}

export function employeeWeekMetrics(snapshot: AppSnapshot, employee: Employee, weekStart: string) {
  const dates = getWeekDates(weekStart)
  const target = dates.reduce((sum, date) => sum + targetMinutes(employee, date, snapshot), 0)
  const planned = snapshot.segments
    .filter((segment) => segment.employeeId === employee.id && dates.includes(segment.date))
    .reduce((sum, segment) => sum + segmentMinutes(segment), 0)
  const actualWorked = snapshot.segments
    .filter((segment) => segment.employeeId === employee.id && dates.includes(segment.date))
    .reduce((sum, segment) => sum + segmentMinutes(segment, true), 0)
  const absenceCredit = snapshot.absences
    .filter((absence) => absence.employeeId === employee.id && dates.includes(absence.date))
    .reduce((sum, absence) => sum + targetMinutes(employee, absence.date, snapshot), 0)
  return { target, planned, actual: actualWorked + absenceCredit, delta: actualWorked + absenceCredit - target }
}

export function datesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}
