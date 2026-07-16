import { useEffect, useState, type DragEvent } from 'react'
import { CalendarCheck, CaretLeft, CaretRight, CheckCircle, Copy, FilePdf, PencilSimple, Plus, Printer, Trash, WarningCircle } from '@phosphor-icons/react'
import type { Absence, AbsenceType, ActionResult, AppSnapshot, Employee, ScheduleSegment, ShiftTemplate } from '@shared/types'
import { addIsoDays, employeeVisibleInWeek, formatDuration, getWeekDates, getWeekStart, minuteToTime, segmentMinutes, targetMinutes, timeToMinute } from '@shared/time'
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { Modal } from '../components/Modal'
import { cx } from '../lib/cx'

const absenceLabel: Record<AbsenceType, string> = { vacation: 'Urlaub', sick: 'Krank', training: 'Fortbildung' }
const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']

export function Planner({ data, report }: { data: AppSnapshot; report: (result: ActionResult) => boolean }) {
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(data.templates[0]?.id ?? null)
  const [editing, setEditing] = useState<{ employee: Employee; date: string; segment?: ScheduleSegment } | null>(null)
  const [managingTemplates, setManagingTemplates] = useState(false)
  const dates = getWeekDates(weekStart)
  const active = data.employees.filter((employee) => employeeVisibleInWeek(employee, weekStart))
  const closed = data.closures.some((closure) => closure.weekStart === weekStart)

  useEffect(() => {
    if (!data.templates.some((template) => template.id === selectedTemplate)) setSelectedTemplate(data.templates[0]?.id ?? null)
  }, [data.templates, selectedTemplate])

  async function addFromTemplate(employee: Employee, date: string) {
    const template = data.templates.find((item) => item.id === selectedTemplate)
    if (!template || closed) { setEditing({ employee, date }); return }
    report(await window.planBaer.planning.saveSegment({ employeeId: employee.id, date, startMinute: template.startMinute, endMinute: template.endMinute, breakMinutes: template.breakMinutes, templateId: template.id, notes: '' }))
  }

  async function handleDrop(event: DragEvent, employee: Employee, date: string) {
    event.preventDefault()
    if (closed) return
    const id = event.dataTransfer.getData('application/x-planbaer-segment')
    const segment = data.segments.find((item) => item.id === id)
    if (!segment) return
    report(await window.planBaer.planning.saveSegment({ ...segment, employeeId: employee.id, date }))
  }

  async function copyWeek() {
    if (window.confirm('Die Schichten der Vorwoche werden ergänzt. Bereits vorhandene Einträge bleiben erhalten.')) report(await window.planBaer.planning.copyPreviousWeek(weekStart))
  }

  async function closeCurrentWeek() {
    if (window.confirm('Nach dem Abschluss ist diese Woche schreibgeschützt. Spätere Änderungen erfolgen als Korrekturbuchung.')) report(await window.planBaer.time.closeWeek(weekStart))
  }

  return <div className="page planner-page">
    <PageHeader eyebrow="Wochenplanung" title="Dienstplan" description="Schichten planen, Abwesenheiten eintragen und Ist-Zeiten bestätigen." actions={<><Button variant="secondary" onClick={() => void window.planBaer.printing.printWeek(weekStart).then(report)}><Printer size={18} /> Drucken</Button><Button variant="secondary" onClick={() => void window.planBaer.printing.exportPdf(weekStart).then(report)}><FilePdf size={18} /> PDF</Button>{!closed && <Button onClick={closeCurrentWeek}><CalendarCheck size={18} /> Woche abschließen</Button>}</>} />

    <Card className="planner-toolbar">
      <div className="week-switcher"><Button variant="ghost" size="icon" aria-label="Vorherige Woche" onClick={() => setWeekStart(addIsoDays(weekStart, -7))}><CaretLeft size={20} /></Button><div><strong>{new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'long'}).format(new Date(`${dates[0]}T12:00:00`))} – {new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(`${dates[4]}T12:00:00`))}</strong><span>Kalenderwoche {getIsoWeek(dates[0])}</span></div><Button variant="ghost" size="icon" aria-label="Nächste Woche" onClick={() => setWeekStart(addIsoDays(weekStart, 7))}><CaretRight size={20} /></Button></div>
      <div className="toolbar-separator" />
      <div className="template-picker" aria-label="Schichtvorlagen"><span>Vorlage</span>{data.templates.map((template) => <button key={template.id} className={cx('template-chip', selectedTemplate === template.id && 'template-chip--active')} aria-pressed={selectedTemplate === template.id} onClick={() => setSelectedTemplate(template.id)}><i style={{ background: template.color }} />{template.name}<small>{minuteToTime(template.startMinute)}–{minuteToTime(template.endMinute)}</small></button>)}<Button variant="ghost" size="icon" aria-label="Schichtvorlagen bearbeiten" title="Schichtvorlagen bearbeiten" onClick={() => setManagingTemplates(true)}><PencilSimple size={17} /></Button></div>
      {!closed && <Button variant="ghost" size="small" onClick={copyWeek}><Copy size={17} /> Vorwoche übernehmen</Button>}
      {closed && <Badge tone="success"><CheckCircle size={15} weight="fill" /> Abgeschlossen</Badge>}
    </Card>

    {active.length === 0 ? <Card className="planner-empty"><h2>Noch niemand im Team</h2><p>Legen Sie im Bereich „Team“ zuerst Mitarbeitende und Vertragsstunden an.</p></Card> :
      <Card className="schedule-wrap"><div className="schedule-grid" style={{ gridTemplateColumns: '220px repeat(5, minmax(172px, 1fr))' }} role="grid" aria-label={`Dienstplan ab ${dates[0]}`}>
        <div className="schedule-head schedule-head--person" role="columnheader">Mitarbeitende</div>
        {dates.map((date, index) => { const holiday = data.holidays.find((item) => item.date === date); return <div key={date} className={cx('schedule-head', holiday && 'schedule-head--holiday')} role="columnheader"><strong>{dayNames[index]}</strong><span>{date.slice(8,10)}.{date.slice(5,7)}.</span>{holiday && <small title={holiday.name}>{holiday.name}</small>}</div> })}
        {active.map((employee) => {
          const planned = data.segments.filter((segment) => segment.employeeId === employee.id && dates.includes(segment.date)).reduce((sum, segment) => sum + segmentMinutes(segment), 0)
          const target = dates.reduce((sum, date) => sum + targetMinutes(employee, date, data), 0)
          return <div key={employee.id} className="schedule-row-contents" style={{ display: 'contents' }}>
            <div className="schedule-person" role="rowheader"><span className="avatar" style={{ background: `${employee.color}1a`, color: employee.color }}>{employee.firstName[0]}{employee.lastName[0]}</span><div><strong>{employee.firstName} {employee.lastName}</strong><span className={cx(planned !== target && 'hours-warning')}>{formatDuration(planned)} / {formatDuration(target)}</span></div></div>
            {dates.map((date) => {
              const shifts = data.segments.filter((segment) => segment.employeeId === employee.id && segment.date === date)
              const absence = data.absences.find((item) => item.employeeId === employee.id && item.date === date)
              const holiday = data.holidays.find((item) => item.date === date)
              return <div key={date} role="gridcell" className={cx('schedule-cell', holiday && 'schedule-cell--holiday', closed && 'schedule-cell--locked')} onDragOver={(event) => !closed && event.preventDefault()} onDrop={(event) => handleDrop(event, employee, date)}>
                {holiday ? <div className="holiday-label">{holiday.name}</div> : absence ? <button className={cx('absence-card', `absence-card--${absence.type}`)} onClick={() => setEditing({ employee, date })}><strong>{absenceLabel[absence.type]}</strong>{absence.notes && <small>{absence.notes}</small>}</button> : <>
                  {shifts.map((segment) => { const template = data.templates.find((item) => item.id === segment.templateId); return <button key={segment.id} draggable={!closed} onDragStart={(event) => event.dataTransfer.setData('application/x-planbaer-segment', segment.id)} className="shift-card" style={{ '--shift-color': template?.color ?? employee.color } as React.CSSProperties} onClick={() => setEditing({ employee, date, segment })}><span><strong>{minuteToTime(segment.startMinute)}–{minuteToTime(segment.endMinute)}</strong><small>{formatDuration(segmentMinutes(segment))}</small></span>{segment.actualEndMinute != null && <i title="Ist-Zeit erfasst"><CheckCircle size={14} weight="fill" /></i>}</button> })}
                  {!closed && <button className="add-shift" aria-label={`Schicht für ${employee.firstName} ${employee.lastName} am ${date} hinzufügen`} onClick={() => addFromTemplate(employee, date)}><Plus size={17} /> <span>{shifts.length ? 'Weiteres Segment' : 'Schicht'}</span></button>}
                </>}
              </div>
            })}
          </div>
        })}
      </div></Card>}
    {editing && <ShiftEditor key={`${editing.segment?.id ?? 'new'}-${editing.employee.id}-${editing.date}`} data={data} target={editing} closed={closed} onClose={() => setEditing(null)} report={report} />}
    {managingTemplates && <TemplateManager data={data} preferredId={selectedTemplate} onClose={() => setManagingTemplates(false)} report={report} />}
  </div>
}

function TemplateManager({ data, preferredId, onClose, report }: { data: AppSnapshot; preferredId: string | null; onClose: () => void; report: (result: ActionResult) => boolean }) {
  const initial = data.templates.find((template) => template.id === preferredId) ?? data.templates[0]
  const [selected, setSelected] = useState<ShiftTemplate | null>(initial ?? null)
  const [form, setForm] = useState(templateForm(initial))

  function choose(template: ShiftTemplate | null) {
    setSelected(template)
    setForm(templateForm(template))
  }

  async function save() {
    const result = await window.planBaer.planning.saveTemplate({
      id: selected?.id,
      name: form.name,
      startMinute: timeToMinute(form.start),
      endMinute: timeToMinute(form.end),
      breakMinutes: Number(form.pause),
      color: form.color
    })
    if (report(result)) onClose()
  }

  async function remove() {
    if (!selected || !window.confirm(`Schichtvorlage „${selected.name}“ löschen? Bereits geplante Schichten bleiben unverändert.`)) return
    const result = await window.planBaer.planning.deleteTemplate(selected.id)
    if (report(result)) onClose()
  }

  const valid = form.name.trim().length > 0 && form.start.length > 0 && form.end.length > 0 && Number.isFinite(Number(form.pause)) && Number(form.pause) >= 0

  return <Modal open onOpenChange={(open) => !open && onClose()} title="Schichtvorlagen anpassen" description="Vorlagen bestimmen die Standardzeiten beim Einplanen. Bestehende Schichten werden nicht nachträglich verändert." width="large" footer={<><span className="modal-spacer" /><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={!valid} onClick={save}>{selected ? 'Änderungen speichern' : 'Vorlage anlegen'}</Button></>}>
    <div className="template-manager">
      <div className="template-manager__list" aria-label="Vorhandene Schichtvorlagen">
        {data.templates.map((template) => <button key={template.id} className={cx('template-manager__item', selected?.id === template.id && 'template-manager__item--active')} aria-pressed={selected?.id === template.id} onClick={() => choose(template)}><i style={{ background: template.color }} /><span><strong>{template.name}</strong><small>{minuteToTime(template.startMinute)}–{minuteToTime(template.endMinute)} · {template.breakMinutes} Min. Pause</small></span><PencilSimple size={16} /></button>)}
        <Button variant="secondary" size="small" onClick={() => choose(null)}><Plus size={16} /> Neue Vorlage</Button>
      </div>
      <div className="template-manager__form">
        <Field label="Name"><Input autoFocus value={form.name} maxLength={80} placeholder="z. B. Frühdienst" onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <div className="form-grid form-grid--3"><Field label="Beginn"><Input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></Field><Field label="Ende"><Input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></Field><Field label="Pause (Minuten)"><Input type="number" min="0" max="480" step="5" value={form.pause} onChange={(event) => setForm({ ...form, pause: event.target.value })} /></Field></div>
        <Field label="Farbe"><div className="template-color-input"><Input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /><span>{form.color.toUpperCase()}</span></div></Field>
        {selected && <div className="template-manager__delete"><Button variant="danger" size="small" disabled={data.templates.length <= 1} onClick={remove}><Trash size={16} /> Vorlage löschen</Button>{data.templates.length <= 1 && <small>Mindestens eine Vorlage muss erhalten bleiben.</small>}</div>}
      </div>
    </div>
  </Modal>
}

function templateForm(template?: ShiftTemplate | null) {
  return {
    name: template?.name ?? '',
    start: minuteToTime(template?.startMinute ?? 480),
    end: minuteToTime(template?.endMinute ?? 960),
    pause: String(template?.breakMinutes ?? 30),
    color: template?.color ?? '#2563eb'
  }
}

function ShiftEditor({ data, target, closed, onClose, report }: { data: AppSnapshot; target: { employee: Employee; date: string; segment?: ScheduleSegment }; closed: boolean; onClose: () => void; report: (result: ActionResult) => boolean }) {
  const currentAbsence = data.absences.find((item) => item.employeeId === target.employee.id && item.date === target.date)
  const defaultTemplate = data.templates.find((item) => item.id === target.segment?.templateId) ?? data.templates[0]
  const [form, setForm] = useState({
    start: minuteToTime(target.segment?.startMinute ?? defaultTemplate?.startMinute ?? 480),
    end: minuteToTime(target.segment?.endMinute ?? defaultTemplate?.endMinute ?? 960),
    pause: String(target.segment?.breakMinutes ?? defaultTemplate?.breakMinutes ?? 30),
    actualStart: target.segment?.actualStartMinute == null ? '' : minuteToTime(target.segment.actualStartMinute),
    actualEnd: target.segment?.actualEndMinute == null ? '' : minuteToTime(target.segment.actualEndMinute),
    actualPause: target.segment?.actualBreakMinutes == null ? '' : String(target.segment.actualBreakMinutes),
    templateId: target.segment?.templateId ?? defaultTemplate?.id ?? '', notes: target.segment?.notes ?? ''
  })

  async function save() {
    const result = await window.planBaer.planning.saveSegment({ id: target.segment?.id, employeeId: target.employee.id, date: target.date, startMinute: timeToMinute(form.start), endMinute: timeToMinute(form.end), breakMinutes: Number(form.pause), actualStartMinute: form.actualStart ? timeToMinute(form.actualStart) : null, actualEndMinute: form.actualEnd ? timeToMinute(form.actualEnd) : null, actualBreakMinutes: form.actualPause ? Number(form.actualPause) : null, templateId: form.templateId || null, notes: form.notes })
    if (report(result)) onClose()
  }

  async function setAbsence(type: AbsenceType) {
    const result = await window.planBaer.planning.setAbsence({ id: currentAbsence?.id, employeeId: target.employee.id, date: target.date, type, notes: form.notes })
    if (report(result)) onClose()
  }

  async function remove() {
    const result = target.segment ? await window.planBaer.planning.deleteSegment(target.segment.id) : currentAbsence ? await window.planBaer.planning.deleteAbsence(currentAbsence.id) : null
    if (result && report(result)) onClose()
  }

  return <Modal open onOpenChange={(open) => !open && onClose()} title={`${target.employee.firstName} ${target.employee.lastName}`} description={`${new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(`${target.date}T12:00:00`))}${closed ? ' · abgeschlossen' : ''}`} width="large" footer={<>{(target.segment || currentAbsence) && !closed && <Button variant="danger" onClick={remove}><Trash size={17} /> Eintrag löschen</Button>}<span className="modal-spacer" /><Button variant="secondary" onClick={onClose}>Abbrechen</Button>{!closed && <Button onClick={save}>Schicht speichern</Button>}</>}>
    {closed && <div className="inline-alert inline-alert--warning"><WarningCircle size={20} /><span>Diese Woche ist abgeschlossen. Änderungen können im Stundenkonto als Korrektur gebucht werden.</span></div>}
    <div className="absence-actions"><span className="label">Ganztägige Abwesenheit</span><div>{(['vacation','sick','training'] as AbsenceType[]).map((type) => <Button key={type} variant={currentAbsence?.type === type ? 'primary' : 'secondary'} size="small" disabled={closed} onClick={() => setAbsence(type)}>{absenceLabel[type]}</Button>)}</div></div>
    <div className="section-divider"><span>oder Schichtzeit</span></div>
    <div className="form-grid form-grid--3"><Field label="Beginn"><Input type="time" value={form.start} disabled={closed} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field><Field label="Ende"><Input type="time" value={form.end} disabled={closed} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field><Field label="Pause (Minuten)"><Input type="number" min="0" step="5" value={form.pause} disabled={closed} onChange={(e) => setForm({ ...form, pause: e.target.value })} /></Field></div>
    <Field label="Schichtvorlage"><select className="input" value={form.templateId} disabled={closed} onChange={(e) => { const template = data.templates.find((item) => item.id === e.target.value); setForm({ ...form, templateId: e.target.value, ...(template ? { start: minuteToTime(template.startMinute), end: minuteToTime(template.endMinute), pause: String(template.breakMinutes) } : {}) }) }}><option value="">Individuell</option>{data.templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></Field>
    <details className="actual-times" open={Boolean(form.actualEnd)}><summary>Ist-Zeit erfassen</summary><p>Leer lassen, wenn die geplante Zeit vollständig übernommen werden soll.</p><div className="form-grid form-grid--3"><Field label="Ist-Beginn"><Input type="time" value={form.actualStart} disabled={closed} onChange={(e) => setForm({ ...form, actualStart: e.target.value })} /></Field><Field label="Ist-Ende"><Input type="time" value={form.actualEnd} disabled={closed} onChange={(e) => setForm({ ...form, actualEnd: e.target.value })} /></Field><Field label="Ist-Pause"><Input type="number" min="0" step="5" value={form.actualPause} disabled={closed} onChange={(e) => setForm({ ...form, actualPause: e.target.value })} /></Field></div></details>
    <Field label="Notiz"><textarea className="input textarea" rows={3} value={form.notes} disabled={closed} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional, nicht auf dem Ausdruck sichtbar" /></Field>
  </Modal>
}

function getIsoWeek(date: string): number {
  const value = new Date(`${date}T12:00:00`)
  const target = new Date(value.valueOf())
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}
