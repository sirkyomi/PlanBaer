import { describe, expect, it } from 'vitest'
import type { AppSnapshot, Employee, ScheduleSegment } from './types'
import { addIsoDays, employeeVisibleInWeek, employeeWeekMetrics, formatDuration, getWeekStart, segmentMinutes, targetMinutes } from './time'

const employee: Employee = {
  id: '00000000-0000-4000-8000-000000000001', firstName: 'Ada', lastName: 'Bär', color: '#2563eb', active: true, createdAt: '2026-01-01',
  contracts: [{ id: '00000000-0000-4000-8000-000000000002', employeeId: '00000000-0000-4000-8000-000000000001', validFrom: '2026-01-01', validTo: null, weeklyMinutes: 1800, mon: 360, tue: 360, wed: 360, thu: 360, fri: 360 }]
}

const segment: ScheduleSegment = { id: 's', employeeId: employee.id, date: '2026-07-13', startMinute: 480, endMinute: 960, breakMinutes: 30, actualStartMinute: 480, actualEndMinute: 990, actualBreakMinutes: 30, templateId: null, notes: '' }

describe('Zeitlogik', () => {
  it('findet Montage und addiert Kalendertage stabil', () => {
    expect(getWeekStart('2026-07-16')).toBe('2026-07-13')
    expect(addIsoDays('2026-07-13', 4)).toBe('2026-07-17')
  })

  it('berechnet Plan- und Istminuten abzüglich Pause', () => {
    expect(segmentMinutes(segment)).toBe(450)
    expect(segmentMinutes(segment, true)).toBe(480)
  })

  it('setzt das Soll an Feiertagen auf null', () => {
    expect(targetMinutes(employee, '2026-07-13', { holidays: [] })).toBe(360)
    expect(targetMinutes(employee, '2026-07-13', { holidays: [{ date: '2026-07-13', name: 'Feiertag' }] })).toBe(0)
  })

  it('bewertet Abwesenheit mit Tagessoll beim Wochenabschluss', () => {
    const snapshot = { employees: [employee], templates: [], segments: [segment], absences: [{ id: 'a', employeeId: employee.id, date: '2026-07-14', type: 'vacation', notes: '' }], closures: [], ledger: [], holidays: [], customClosedDays: [], settings: { institutionName: 'Test', address: '', stateCode: 'NW', theme: 'system' }, appVersion: '0' } as AppSnapshot
    expect(employeeWeekMetrics(snapshot, employee, '2026-07-13')).toEqual({ target: 1800, planned: 450, actual: 840, delta: -960 })
  })

  it('blendet archivierte Personen nur in aktuellen und zukünftigen Wochen aus', () => {
    const archived = { ...employee, active: false }
    expect(employeeVisibleInWeek(archived, '2026-07-13', '2026-07-16')).toBe(false)
    expect(employeeVisibleInWeek(archived, '2026-07-06', '2026-07-16')).toBe(true)
    expect(employeeVisibleInWeek(employee, '2026-07-13', '2026-07-16')).toBe(true)
  })

  it('formatiert positive und negative Salden', () => {
    expect(formatDuration(75, true)).toBe('+1:15 h')
    expect(formatDuration(-75, true)).toBe('−1:15 h')
  })
})
