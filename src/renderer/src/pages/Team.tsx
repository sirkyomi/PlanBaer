import { useMemo, useState } from 'react'
import { FileCsv, PencilSimple, Plus, Trash, UserPlus } from '@phosphor-icons/react'
import type { ActionResult, AppSnapshot, Employee } from '@shared/types'
import { formatDuration } from '@shared/time'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '../components/ui'
import { Modal } from '../components/Modal'

export function Team({ data, report }: { data: AppSnapshot; report: (result: ActionResult) => boolean }) {
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)
  const active = data.employees.filter((employee) => employee.active)
  const archived = data.employees.filter((employee) => !employee.active)

  async function archive(employee: Employee) {
    if (window.confirm(`${employee.firstName} ${employee.lastName} archivieren? Dienstpläne und Stundenkonto bleiben erhalten.`)) report(await window.planBaer.team.archive(employee.id))
  }

  return <div className="page team-page">
    <PageHeader eyebrow="Stammdaten" title="Team" description="Mitarbeitende, Vertragsstunden und individuelle Tagesprofile verwalten." actions={<><Button variant="secondary" onClick={() => void window.planBaer.team.importCsv().then(report)}><FileCsv size={18} /> CSV importieren</Button><Button variant="secondary" onClick={() => void window.planBaer.team.exportCsv().then(report)}><FileCsv size={18} /> CSV exportieren</Button><Button onClick={() => setEditing('new')}><UserPlus size={18} /> Person anlegen</Button></>} />
    <Card className="table-card">
      {active.length === 0 ? <EmptyState icon={<UserPlus size={28} />} title="Ihr Team wartet" text="Legen Sie die erste Person mit Wochenstunden und regulären Arbeitstagen an." action={<Button onClick={() => setEditing('new')}><Plus size={17} /> Erste Person anlegen</Button>} /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Vertrag ab</th><th>Wochenstunden</th><th>Tagesprofil Mo–Fr</th><th>Status</th><th><span className="sr-only">Aktionen</span></th></tr></thead><tbody>{active.map((employee) => { const contract = employee.contracts[0]; return <tr key={employee.id}><td><div className="person-cell"><span className="avatar" style={{ background: `${employee.color}1a`, color: employee.color }}>{employee.firstName[0]}{employee.lastName[0]}</span><div><strong>{employee.firstName} {employee.lastName}</strong><small>{employee.contracts.length > 1 ? `${employee.contracts.length} Vertragsperioden` : 'Eine Vertragsperiode'}</small></div></div></td><td>{contract?.validFrom.split('-').reverse().join('.') ?? '—'}</td><td className="tabular"><strong>{formatDuration(contract?.weeklyMinutes ?? 0)}</strong></td><td><div className="day-profile">{contract ? [contract.mon,contract.tue,contract.wed,contract.thu,contract.fri].map((minutes,index) => <span key={index}>{['Mo','Di','Mi','Do','Fr'][index]} <strong>{minutes ? formatDuration(minutes).replace(' h','') : '—'}</strong></span>) : '—'}</div></td><td><Badge tone="success">Aktiv</Badge></td><td><div className="row-actions"><Button variant="ghost" size="icon" aria-label={`${employee.firstName} ${employee.lastName} bearbeiten`} onClick={() => setEditing(employee)}><PencilSimple size={18} /></Button><Button variant="ghost" size="icon" aria-label={`${employee.firstName} ${employee.lastName} archivieren`} onClick={() => archive(employee)}><Trash size={18} /></Button></div></td></tr>})}</tbody></table></div>}
    </Card>
    {archived.length > 0 && <details className="archived-section"><summary>{archived.length} archivierte {archived.length === 1 ? 'Person' : 'Personen'}</summary><div>{archived.map((employee) => <button key={employee.id} onClick={() => setEditing(employee)}>{employee.firstName} {employee.lastName}</button>)}</div></details>}
    {editing && <EmployeeEditor key={editing === 'new' ? 'new' : editing.id} employee={editing === 'new' ? undefined : editing} report={report} onClose={() => setEditing(null)} />}
  </div>
}

const palette = ['#2563eb','#0f766e','#7c3aed','#c2410c','#be185d','#0369a1','#4d7c0f']

function EmployeeEditor({ employee, report, onClose }: { employee?: Employee; report: (result: ActionResult) => boolean; onClose: () => void }) {
  const contract = employee?.contracts[0]
  const [form, setForm] = useState({
    firstName: employee?.firstName ?? '', lastName: employee?.lastName ?? '', color: employee?.color ?? palette[0], validFrom: contract?.validFrom ?? new Date().toISOString().slice(0,10),
    weekly: String((contract?.weeklyMinutes ?? 1950) / 60), mon: String((contract?.mon ?? 390) / 60), tue: String((contract?.tue ?? 390) / 60), wed: String((contract?.wed ?? 390) / 60), thu: String((contract?.thu ?? 390) / 60), fri: String((contract?.fri ?? 390) / 60), opening: '0'
  })
  const dayTotal = useMemo(() => ['mon','tue','wed','thu','fri'].reduce((sum,key) => sum + Number(form[key as keyof typeof form] || 0),0), [form])
  const weekly = Number(form.weekly || 0)

  function distribute() {
    const daily = Math.round((weekly / 5) * 100) / 100
    const last = Math.round((weekly - daily * 4) * 100) / 100
    setForm({ ...form, mon: String(daily), tue: String(daily), wed: String(daily), thu: String(daily), fri: String(last) })
  }

  async function save() {
    const result = await window.planBaer.team.save({ id: employee?.id, firstName: form.firstName, lastName: form.lastName, color: form.color, validFrom: form.validFrom, weeklyMinutes: Math.round(weekly * 60), dayProfile: { mon: Math.round(Number(form.mon) * 60), tue: Math.round(Number(form.tue) * 60), wed: Math.round(Number(form.wed) * 60), thu: Math.round(Number(form.thu) * 60), fri: Math.round(Number(form.fri) * 60) }, openingBalanceMinutes: employee ? undefined : Math.round(Number(form.opening) * 60) })
    if (report(result)) onClose()
  }

  return <Modal open onOpenChange={(open) => !open && onClose()} title={employee ? 'Mitarbeitende Person bearbeiten' : 'Mitarbeitende Person anlegen'} description="Vertragsänderungen können mit einem neuen Gültigkeitsdatum historisiert werden." width="large" footer={<><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button onClick={save} disabled={!form.firstName || !form.lastName || dayTotal !== weekly}>Speichern</Button></>}>
    <div className="form-grid form-grid--2"><Field label="Vorname"><Input autoFocus value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field><Field label="Nachname"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field></div>
    <fieldset className="color-field"><legend className="label">Farbe im Dienstplan</legend><div>{palette.map((color) => <button key={color} type="button" className={form.color === color ? 'color-dot color-dot--active' : 'color-dot'} style={{ background: color }} onClick={() => setForm({ ...form, color })} aria-label={`Farbe ${color}`} aria-pressed={form.color === color} />)}</div></fieldset>
    <div className="contract-panel"><div className="contract-panel__header"><div><span className="eyebrow">Vertrag</span><h3>Wochen- und Tagesprofil</h3></div><Button variant="ghost" size="small" onClick={distribute}>Gleichmäßig verteilen</Button></div>
      <div className="form-grid form-grid--2"><Field label="Gültig ab"><Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field><Field label="Wochenstunden"><Input type="number" min="1" max="80" step="0.25" value={form.weekly} onChange={(e) => setForm({ ...form, weekly: e.target.value })} /></Field></div>
      <div className="weekday-inputs">{([['mon','Montag'],['tue','Dienstag'],['wed','Mittwoch'],['thu','Donnerstag'],['fri','Freitag']] as const).map(([key,label]) => <Field key={key} label={label}><Input type="number" min="0" max="16" step="0.25" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></Field>)}</div>
      <div className={dayTotal === weekly ? 'sum-check sum-check--ok' : 'sum-check'}><span>Tagesprofile: <strong>{dayTotal.toLocaleString('de-DE')} h</strong></span><span>Wochenstunden: <strong>{weekly.toLocaleString('de-DE')} h</strong></span></div>
    </div>
    {!employee && <Field label="Startsaldo in Stunden" hint="Positive oder negative Überstunden, die bereits vor PlanBär bestanden."><Input type="number" step="0.25" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} /></Field>}
  </Modal>
}
