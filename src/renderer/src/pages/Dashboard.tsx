import { CalendarBlank, ChartLineUp, CheckCircle, Clock, Plus, UsersThree, WarningCircle } from '@phosphor-icons/react'
import type { AppSnapshot } from '@shared/types'
import { employeeWeekMetrics, formatDuration, getWeekDates, getWeekStart, minuteToTime } from '@shared/time'
import { Badge, Button, Card, EmptyState, MetricCard, PageHeader } from '../components/ui'

export function Dashboard({ data, navigate }: { data: AppSnapshot; report: (result: any) => boolean; navigate: (page: 'planner' | 'team' | 'ledger' | 'statistics' | 'dashboard' | 'settings') => void }) {
  const weekStart = getWeekStart()
  const dates = getWeekDates(weekStart)
  const active = data.employees.filter((employee) => employee.active)
  const metrics = active.map((employee) => employeeWeekMetrics(data, employee, weekStart))
  const target = metrics.reduce((sum, item) => sum + item.target, 0)
  const planned = metrics.reduce((sum, item) => sum + item.planned, 0)
  const totalBalance = data.ledger.reduce((sum, item) => sum + item.minutes, 0)
  const closed = data.closures.some((item) => item.weekStart === weekStart)
  const missing = active.filter((employee) => !data.segments.some((segment) => segment.employeeId === employee.id && dates.includes(segment.date)) && !data.absences.some((absence) => absence.employeeId === employee.id && dates.includes(absence.date)))

  return <div className="page dashboard-page">
    <PageHeader eyebrow="Guten Tag" title={data.settings.institutionName} description="Hier sehen Sie auf einen Blick, was in dieser Woche wichtig ist." actions={<Button onClick={() => navigate('planner')}><Plus size={18} weight="bold" /> Dienstplan öffnen</Button>} />
    <section className="metric-grid" data-tour="week-overview" aria-label="Kennzahlen dieser Woche">
      <MetricCard label="Aktives Team" value={`${active.length}`} detail="Mitarbeitende" icon={<UsersThree size={23} />} />
      <MetricCard label="Geplant" value={formatDuration(planned)} detail={`von ${formatDuration(target)} Soll`} icon={<CalendarBlank size={23} />} tone="green" />
      <MetricCard label="Team-Saldo" value={formatDuration(totalBalance, true)} detail="inklusive Korrekturen" icon={<ChartLineUp size={23} />} tone={totalBalance >= 0 ? 'purple' : 'amber'} />
      <MetricCard label="Wochenstatus" value={closed ? 'Abgeschlossen' : 'In Planung'} detail={`ab ${dates[0].slice(8, 10)}.${dates[0].slice(5, 7)}.`} icon={closed ? <CheckCircle size={23} /> : <Clock size={23} />} tone={closed ? 'green' : 'amber'} />
    </section>

    <div className="dashboard-grid">
      <Card className="dashboard-panel dashboard-panel--wide">
        <div className="panel-header"><div><span className="eyebrow">Diese Woche</span><h2>Teamplan</h2></div><Button variant="secondary" size="small" onClick={() => navigate('planner')}>Vollständig öffnen</Button></div>
        {active.length === 0 ? <EmptyState icon={<UsersThree size={26} />} title="Noch kein Team angelegt" text="Legen Sie zuerst Ihre Mitarbeitenden und deren Wochenstunden an." action={<Button size="small" onClick={() => navigate('team')}>Team anlegen</Button>} /> :
          <div className="mini-schedule"><div className="mini-schedule__header"><span>Mitarbeitende</span>{dates.map((date) => <span key={date}>{new Intl.DateTimeFormat('de-DE',{weekday:'short'}).format(new Date(`${date}T12:00:00`))}<small>{date.slice(8,10)}.{date.slice(5,7)}.</small></span>)}</div>
          {active.slice(0, 8).map((employee) => <div className="mini-schedule__row" key={employee.id}><strong><i style={{ background: employee.color }} />{employee.firstName} {employee.lastName}</strong>{dates.map((date) => {
            const absence = data.absences.find((item) => item.employeeId === employee.id && item.date === date)
            const shifts = data.segments.filter((item) => item.employeeId === employee.id && item.date === date)
            return <span key={date}>{absence ? <Badge tone={absence.type === 'sick' ? 'danger' : absence.type === 'training' ? 'purple' : 'success'}>{absence.type === 'sick' ? 'Krank' : absence.type === 'training' ? 'Fortbildung' : 'Urlaub'}</Badge> : shifts.length ? shifts.map((shift) => <small className="mini-shift" key={shift.id}>{minuteToTime(shift.startMinute)}–{minuteToTime(shift.endMinute)}</small>) : <small className="muted-dash">—</small>}</span>
          })}</div>)}</div>}
      </Card>

      <Card className="dashboard-panel">
        <div className="panel-header"><div><span className="eyebrow">Planungscheck</span><h2>Offene Punkte</h2></div></div>
        <div className="check-list">
          <div className={missing.length ? 'check-item check-item--warning' : 'check-item check-item--ok'}>{missing.length ? <WarningCircle size={22} /> : <CheckCircle size={22} />}<div><strong>{missing.length ? `${missing.length} ohne Eintrag` : 'Alle berücksichtigt'}</strong><span>{missing.length ? 'Diese Personen haben noch keine Schicht oder Abwesenheit.' : 'Jede aktive Person hat mindestens einen Wocheneintrag.'}</span></div></div>
          <div className={closed ? 'check-item check-item--ok' : 'check-item'}>{closed ? <CheckCircle size={22} /> : <Clock size={22} />}<div><strong>{closed ? 'Woche verbucht' : 'Ist-Zeiten offen'}</strong><span>{closed ? 'Der Wochensaldo ist im Stundenkonto enthalten.' : 'Nach der Woche Ist-Zeiten prüfen und abschließen.'}</span></div></div>
        </div>
        <Button variant="secondary" className="full-width" onClick={() => navigate(closed ? 'ledger' : 'planner')}>{closed ? 'Stundenkonto ansehen' : 'Woche bearbeiten'}</Button>
      </Card>
    </div>
  </div>
}
