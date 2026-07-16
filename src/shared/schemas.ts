import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss JJJJ-MM-TT entsprechen')
const minute = z.number().int().min(0).max(24 * 60)

export const shiftTemplateInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Bitte geben Sie einen Namen ein.').max(80),
  startMinute: minute,
  endMinute: minute,
  breakMinutes: z.number().int().min(0).max(8 * 60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Bitte wählen Sie eine gültige Farbe.')
}).superRefine((value, ctx) => {
  if (value.endMinute <= value.startMinute) ctx.addIssue({ code: 'custom', message: 'Das Ende muss nach dem Beginn liegen.', path: ['endMinute'] })
  if (value.breakMinutes >= value.endMinute - value.startMinute) ctx.addIssue({ code: 'custom', message: 'Die Pause muss kürzer als die Schicht sein.', path: ['breakMinutes'] })
})

export const employeeInputSchema = z.object({
  id: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  validFrom: isoDate,
  weeklyMinutes: z.number().int().min(60).max(80 * 60),
  dayProfile: z.object({ mon: minute, tue: minute, wed: minute, thu: minute, fri: minute }),
  openingBalanceMinutes: z.number().int().min(-100000).max(100000).optional()
}).superRefine((value, ctx) => {
  const total = Object.values(value.dayProfile).reduce((sum, item) => sum + item, 0)
  if (total !== value.weeklyMinutes) ctx.addIssue({ code: 'custom', message: 'Die Tagesprofile müssen den Wochenstunden entsprechen.', path: ['dayProfile'] })
})

export const segmentInputSchema = z.object({
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  date: isoDate,
  startMinute: minute,
  endMinute: minute,
  breakMinutes: z.number().int().min(0).max(8 * 60),
  actualStartMinute: minute.nullish(),
  actualEndMinute: minute.nullish(),
  actualBreakMinutes: z.number().int().min(0).max(8 * 60).nullish(),
  templateId: z.string().uuid().nullish(),
  notes: z.string().max(500).optional()
}).superRefine((value, ctx) => {
  if (value.endMinute <= value.startMinute) ctx.addIssue({ code: 'custom', message: 'Das Ende muss nach dem Beginn liegen.', path: ['endMinute'] })
  if (value.breakMinutes >= value.endMinute - value.startMinute) ctx.addIssue({ code: 'custom', message: 'Die Pause muss kürzer als die Schicht sein.', path: ['breakMinutes'] })
  if (value.actualStartMinute != null && value.actualEndMinute != null && value.actualEndMinute <= value.actualStartMinute) {
    ctx.addIssue({ code: 'custom', message: 'Das tatsächliche Ende muss nach dem Beginn liegen.', path: ['actualEndMinute'] })
  }
})

export const absenceInputSchema = z.object({
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  date: isoDate,
  type: z.enum(['vacation', 'sick', 'training']),
  notes: z.string().max(500).optional()
})

export const correctionInputSchema = z.object({
  employeeId: z.string().uuid(),
  date: isoDate,
  minutes: z.number().int().min(-10000).max(10000).refine((value) => value !== 0, 'Die Korrektur darf nicht null sein.'),
  reason: z.string().trim().min(3).max(300)
})

export const settingsSchema = z.object({
  institutionName: z.string().trim().min(1).max(160),
  address: z.string().trim().max(300),
  stateCode: z.enum(['BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH']),
  theme: z.enum(['system', 'light', 'dark'])
})

export const closedDaySchema = z.object({
  date: isoDate,
  name: z.string().trim().min(2).max(120)
})

export const idSchema = z.string().uuid()
export const weekStartSchema = isoDate
export const dateRangeSchema = z.object({ from: isoDate, to: isoDate }).refine((value) => value.from <= value.to, 'Der Zeitraum ist ungültig.')
