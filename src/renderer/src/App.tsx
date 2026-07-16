import { useEffect, useState } from 'react'
import { CalendarBlank, ChartLineUp, ClockCounterClockwise, GearSix, House, PawPrint, UsersThree, WarningCircle } from '@phosphor-icons/react'
import { usePlanBaer } from './hooks/usePlanBaer'
import { cx } from './lib/cx'
import { Dashboard } from './pages/Dashboard'
import { Planner } from './pages/Planner'
import { Team } from './pages/Team'
import { Ledger } from './pages/Ledger'
import { Statistics } from './pages/Statistics'
import { Settings } from './pages/Settings'

export type PageProps = NonNullable<ReturnType<typeof usePlanBaer>['data']> extends infer _ ? {
  data: NonNullable<ReturnType<typeof usePlanBaer>['data']>
  report: ReturnType<typeof usePlanBaer>['report']
} : never

const navigation = [
  { id: 'dashboard', label: 'Übersicht', icon: House },
  { id: 'planner', label: 'Dienstplan', icon: CalendarBlank },
  { id: 'team', label: 'Team', icon: UsersThree },
  { id: 'ledger', label: 'Stundenkonto', icon: ClockCounterClockwise },
  { id: 'statistics', label: 'Statistik', icon: ChartLineUp },
  { id: 'settings', label: 'Einstellungen', icon: GearSix }
] as const
type PageId = typeof navigation[number]['id']

export default function App() {
  const { data, loading, error, notice, report } = usePlanBaer()
  const [page, setPage] = useState<PageId>('dashboard')

  useEffect(() => {
    if (!data) return
    document.documentElement.dataset.theme = data.settings.theme
    document.documentElement.classList.toggle('dark', data.settings.theme === 'dark' || (data.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches))
  }, [data?.settings.theme])

  if (loading) return <div className="loading-screen"><PawPrint size={38} weight="fill" /><strong>PlanBär startet …</strong><span>Lokale Daten werden vorbereitet.</span></div>
  if (error || !data) return <div className="fatal-error"><WarningCircle size={42} /><h1>PlanBär konnte nicht starten</h1><p>{error || 'Unbekannter Fehler'}</p><button onClick={() => location.reload()}>Erneut versuchen</button></div>

  const props = { data, report }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Zum Hauptinhalt springen</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand__mark"><PawPrint size={25} weight="fill" /></span><span><strong>PlanBär</strong><small>Schichtplanung</small></span></div>
      <nav aria-label="Hauptnavigation">{navigation.map((item) => {
        const Icon = item.icon
        return <button key={item.id} className={cx('nav-item', page === item.id && 'nav-item--active')} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><Icon size={21} weight={page === item.id ? 'fill' : 'regular'} /><span>{item.label}</span></button>
      })}</nav>
      <div className="sidebar__footer"><span>Version {data.appVersion}</span></div>
    </aside>
    <main id="main-content" tabIndex={-1}>
      {page === 'dashboard' && <Dashboard {...props} navigate={setPage} />}
      {page === 'planner' && <Planner {...props} />}
      {page === 'team' && <Team {...props} />}
      {page === 'ledger' && <Ledger {...props} />}
      {page === 'statistics' && <Statistics {...props} />}
      {page === 'settings' && <Settings {...props} />}
    </main>
    {notice && <div className={cx('toast', notice.ok ? 'toast--success' : 'toast--error')} role="status" aria-live="polite">{notice.ok ? <span className="toast__check">✓</span> : <WarningCircle size={20} />}<span>{notice.message}</span></div>}
  </div>
}
