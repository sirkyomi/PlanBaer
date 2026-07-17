import { useMemo, useState } from 'react'
import { ClockCounterClockwise, Plus, TrendDown, TrendUp } from '@phosphor-icons/react'
import type { ActionResult, AppSnapshot, Employee } from '@shared/types'
import { formatDuration } from '@shared/time'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '../components/ui'
import { Modal } from '../components/Modal'

export function Ledger({ data, report }: { data: AppSnapshot; report: (result: ActionResult) => boolean }) {
  const [selected, setSelected] = useState<string>('all')
  const [correcting, setCorrecting] = useState<Employee | null>(null)
  const balances = useMemo(() => data.employees.map((employee) => ({ employee, minutes: data.ledger.filter((entry) => entry.employeeId === employee.id).reduce((sum, entry) => sum + entry.minutes, 0) })).sort((a,b) => b.minutes-a.minutes), [data])
  const entries = data.ledger.filter((entry) => selected === 'all' || entry.employeeId === selected)

  return <div className="page ledger-page">
    <PageHeader eyebrow="Arbeitszeit" title="Stundenkonto" description="Wochenabschlüsse, Startsalden und begründete Korrekturen nachvollziehen." actions={<Button onClick={() => { const employee = data.employees.find((item) => item.id === selected) ?? data.employees.find((item) => item.active); if (employee) setCorrecting(employee) }} disabled={!data.employees.length}><Plus size={18} /> Korrektur buchen</Button>} />
    <div className="balance-strip">{balances.filter((item) => item.employee.active).slice(0,6).map(({ employee, minutes }) => <button key={employee.id} className="balance-card" onClick={() => setSelected(employee.id)}><span className="avatar" style={{ background:`${employee.color}1a`,color:employee.color }}>{employee.firstName[0]}{employee.lastName[0]}</span><span><small>{employee.firstName} {employee.lastName}</small><strong className={minutes < 0 ? 'negative' : ''}>{formatDuration(minutes,true)}</strong></span>{minutes >= 0 ? <TrendUp size={20} /> : <TrendDown size={20} />}</button>)}</div>
    <Card className="table-card" data-tour="ledger-history">
      <div className="table-toolbar"><div><h2>Buchungsverlauf</h2><p>Einträge sind unveränderlich und chronologisch nachvollziehbar.</p></div><label><span className="sr-only">Mitarbeitende filtern</span><select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="all">Gesamtes Team</option>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}</select></label></div>
      {!entries.length ? <EmptyState icon={<ClockCounterClockwise size={28} />} title="Noch keine Buchungen" text="Nach dem ersten Wochenabschluss erscheint hier die Saldoentwicklung." /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Datum</th><th>Mitarbeitende</th><th>Art</th><th>Begründung</th><th className="align-right">Änderung</th><th className="align-right">Laufender Saldo</th></tr></thead><tbody>{entries.map((entry) => { const employee = data.employees.find((item) => item.id === entry.employeeId); const employeeEntries = data.ledger.filter((item) => item.employeeId === entry.employeeId && (item.date < entry.date || (item.date === entry.date && item.createdAt <= entry.createdAt))); const running = employeeEntries.reduce((sum,item) => sum+item.minutes,0); return <tr key={entry.id}><td className="tabular">{entry.date.split('-').reverse().join('.')}</td><td><strong>{employee ? `${employee.firstName} ${employee.lastName}` : 'Archivierte Person'}</strong></td><td><Badge tone={entry.kind === 'correction' ? 'warning' : entry.kind === 'opening' ? 'info' : 'success'}>{entry.kind === 'correction' ? 'Korrektur' : entry.kind === 'opening' ? 'Startsaldo' : 'Wochenabschluss'}</Badge></td><td>{entry.reason}</td><td className={entry.minutes < 0 ? 'align-right tabular negative' : 'align-right tabular positive'}><strong>{formatDuration(entry.minutes,true)}</strong></td><td className="align-right tabular">{formatDuration(running,true)}</td></tr>})}</tbody></table></div>}
    </Card>
    {correcting && <CorrectionModal employee={correcting} report={report} onClose={() => setCorrecting(null)} />}
  </div>
}

function CorrectionModal({ employee, report, onClose }: { employee: Employee; report: (result: ActionResult) => boolean; onClose: () => void }) {
  const [form,setForm] = useState({ date:new Date().toISOString().slice(0,10), hours:'0', reason:'' })
  async function save() { const result = await window.planBaer.time.addCorrection({ employeeId:employee.id,date:form.date,minutes:Math.round(Number(form.hours)*60),reason:form.reason }); if(report(result)) onClose() }
  return <Modal open onOpenChange={(open) => !open && onClose()} title="Stundenkorrektur" description={`${employee.firstName} ${employee.lastName} · Dieser Eintrag wird dauerhaft protokolliert.`} footer={<><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button onClick={save} disabled={!form.reason.trim() || !Number(form.hours)}>Korrektur buchen</Button></>}>
    <div className="form-grid form-grid--2"><Field label="Buchungsdatum"><Input type="date" value={form.date} onChange={(e) => setForm({...form,date:e.target.value})} /></Field><Field label="Stunden (+ oder −)" hint="Beispiel: 1,5 oder -0,75"><Input autoFocus type="number" step="0.25" value={form.hours} onChange={(e) => setForm({...form,hours:e.target.value})} /></Field></div>
    <Field label="Begründung"><textarea className="input textarea" rows={4} value={form.reason} onChange={(e) => setForm({...form,reason:e.target.value})} placeholder="Zum Beispiel: Nachgemeldete Teamsitzung" /></Field>
  </Modal>
}
