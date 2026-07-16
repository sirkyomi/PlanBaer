import { describe, expect, it } from 'vitest'
import { closedDaySchema, employeeInputSchema, segmentInputSchema, shiftTemplateInputSchema } from './schemas'

describe('Fachliche Validierung', () => {
  it('akzeptiert ein konsistentes Teilzeitprofil', () => {
    const result = employeeInputSchema.safeParse({ firstName: 'Mina', lastName: 'Bär', color: '#2563eb', validFrom: '2026-01-01', weeklyMinutes: 1200, dayProfile: { mon: 300, tue: 300, wed: 300, thu: 300, fri: 0 } })
    expect(result.success).toBe(true)
  })

  it('weist inkonsistente Wochen- und Tagesstunden zurück', () => {
    const result = employeeInputSchema.safeParse({ firstName: 'Mina', lastName: 'Bär', color: '#2563eb', validFrom: '2026-01-01', weeklyMinutes: 1200, dayProfile: { mon: 300, tue: 300, wed: 300, thu: 0, fri: 0 } })
    expect(result.success).toBe(false)
  })

  it('verhindert negative Schichtdauern und zu lange Pausen', () => {
    const base = { employeeId: '00000000-0000-4000-8000-000000000001', date: '2026-07-13', startMinute: 600, endMinute: 540, breakMinutes: 90 }
    expect(segmentInputSchema.safeParse(base).success).toBe(false)
    expect(segmentInputSchema.safeParse({ ...base, startMinute: 480, endMinute: 540, breakMinutes: 60 }).success).toBe(false)
  })

  it('erlaubt mehrere valide Tagessegmente unabhängig voneinander', () => {
    const first = segmentInputSchema.safeParse({ employeeId: '00000000-0000-4000-8000-000000000001', date: '2026-07-13', startMinute: 420, endMinute: 600, breakMinutes: 0 })
    const second = segmentInputSchema.safeParse({ employeeId: '00000000-0000-4000-8000-000000000001', date: '2026-07-13', startMinute: 720, endMinute: 900, breakMinutes: 0 })
    expect(first.success && second.success).toBe(true)
  })

  it('validiert bearbeitbare Schichtvorlagen', () => {
    expect(shiftTemplateInputSchema.safeParse({ name: 'Frühdienst', startMinute: 420, endMinute: 900, breakMinutes: 30, color: '#2563eb' }).success).toBe(true)
    expect(shiftTemplateInputSchema.safeParse({ name: '', startMinute: 900, endMinute: 420, breakMinutes: 30, color: 'blau' }).success).toBe(false)
  })

  it('validiert eigene Schließtage als lokale ISO-Daten', () => {
    expect(closedDaySchema.safeParse({ date: '2026-08-21', name: 'Betriebsausflug' }).success).toBe(true)
    expect(closedDaySchema.safeParse({ date: '21.08.2026', name: 'X' }).success).toBe(false)
  })
})
