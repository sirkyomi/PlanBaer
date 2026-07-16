import { useMemo, useState } from 'react'
import { ChartBar, FileCsv } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ActionResult, AppSnapshot } from '@shared/types'
import { addIsoDays, formatDuration, segmentMinutes, targetMinutes } from '@shared/time'
import { Button, Card, PageHeader } from '../components/ui'

function firstOfMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01` }

export function Statistics({ data, report }: { data: AppSnapshot; report: (result: ActionResult) => boolean }) {
  const [from,setFrom] = useState(firstOfMonth())
  const [to,setTo] = useState(new Date().toISOString().slice(0,10))
  const rows = useMemo(() => data.employees.filter((employee) => employee.active).map((employee) => {
    let target = 0
    for(let date=from; date<=to; date=addIsoDays(date,1)) target += targetMinutes(employee,date,data)
    const segments = data.segments.filter((item) => item.employeeId===employee.id && item.date>=from && item.date<=to)
    const absences = data.absences.filter((item) => item.employeeId===employee.id && item.date>=from && item.date<=to)
    const planned = segments.reduce((sum,item)=>sum+segmentMinutes(item),0)
    const actual = segments.reduce((sum,item)=>sum+segmentMinutes(item,true),0)+absences.reduce((sum,item)=>sum+targetMinutes(employee,item.date,data),0)
    const balance = data.ledger.filter((item)=>item.employeeId===employee.id && item.date>=from && item.date<=to).reduce((sum,item)=>sum+item.minutes,0)
    return { id:employee.id,name:`${employee.firstName} ${employee.lastName}`,target,planned,actual,difference:actual-target,balance,absences:absences.length,Soll:Math.round(target/6)/10,Plan:Math.round(planned/6)/10,Ist:Math.round(actual/6)/10 }
  }),[data,from,to])
  const totals = rows.reduce((acc,row)=>({target:acc.target+row.target,planned:acc.planned+row.planned,actual:acc.actual+row.actual,difference:acc.difference+row.difference,balance:acc.balance+row.balance,absences:acc.absences+row.absences}),{target:0,planned:0,actual:0,difference:0,balance:0,absences:0})

  return <div className="page statistics-page">
    <PageHeader eyebrow="Auswertung" title="Statistik" description="Soll-, Plan- und Ist-Zeiten vergleichen und als CSV weiterverarbeiten." actions={<Button variant="secondary" onClick={()=>void window.planBaer.statistics.exportCsv(from,to).then(report)}><FileCsv size={18}/> CSV exportieren</Button>} />
    <Card className="stats-filter"><label><span>Von</span><input className="input" type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></label><label><span>Bis</span><input className="input" type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></label><div className="stats-filter__summary"><span>Team-Ist</span><strong>{formatDuration(totals.actual)}</strong><small>{formatDuration(totals.difference,true)} zum Soll</small></div><div className="stats-filter__summary"><span>Saldoänderung</span><strong>{formatDuration(totals.balance,true)}</strong><small>{totals.absences} Abwesenheitstage</small></div></Card>
    <Card className="chart-card"><div className="panel-header"><div><span className="eyebrow">Stundenvergleich</span><h2>Soll, Plan und Ist pro Person</h2></div><ChartBar size={23}/></div>
      {rows.length ? <figure aria-labelledby="chart-caption"><figcaption id="chart-caption" className="sr-only">Balkendiagramm mit Soll-, Plan- und Ist-Stunden je Mitarbeiterin oder Mitarbeiter. Die Werte sind zusätzlich in der Tabelle darunter aufgeführt.</figcaption><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{top:8,right:12,left:0,bottom:4}}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)"/><XAxis dataKey="name" tick={{fill:'var(--muted-foreground)',fontSize:12}} axisLine={false} tickLine={false}/><YAxis unit=" h" tick={{fill:'var(--muted-foreground)',fontSize:12}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,color:'var(--foreground)'}} formatter={(value)=>`${value} h`}/><Legend/><Bar dataKey="Soll" fill="#94a3b8" radius={[5,5,0,0]}/><Bar dataKey="Plan" fill="#60a5fa" radius={[5,5,0,0]}/><Bar dataKey="Ist" fill="#2563eb" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></figure> : <div className="chart-empty"><ChartBar size={30}/><span>Für diesen Zeitraum liegen noch keine aktiven Teamdaten vor.</span></div>}
    </Card>
    <Card className="table-card"><div className="table-toolbar"><div><h2>Tabellarische Auswertung</h2><p>Alle Diagrammwerte in exakter, barrierefreier Form.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Mitarbeitende</th><th className="align-right">Soll</th><th className="align-right">Plan</th><th className="align-right">Ist</th><th className="align-right">Differenz</th><th className="align-right">Saldo</th><th className="align-right">Abwesenheit</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><strong>{row.name}</strong></td><td className="align-right tabular">{formatDuration(row.target)}</td><td className="align-right tabular">{formatDuration(row.planned)}</td><td className="align-right tabular">{formatDuration(row.actual)}</td><td className={row.difference<0?'align-right tabular negative':'align-right tabular positive'}>{formatDuration(row.difference,true)}</td><td className={row.balance<0?'align-right tabular negative':'align-right tabular positive'}>{formatDuration(row.balance,true)}</td><td className="align-right tabular">{row.absences} Tage</td></tr>)}</tbody><tfoot><tr><th>Gesamt</th><th className="align-right">{formatDuration(totals.target)}</th><th className="align-right">{formatDuration(totals.planned)}</th><th className="align-right">{formatDuration(totals.actual)}</th><th className="align-right">{formatDuration(totals.difference,true)}</th><th className="align-right">{formatDuration(totals.balance,true)}</th><th className="align-right">{totals.absences} Tage</th></tr></tfoot></table></div></Card>
  </div>
}
