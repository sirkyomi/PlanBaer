import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, CalendarCheck, Check, PawPrint, X } from '@phosphor-icons/react'
import { Button } from './ui'

type PageId = 'dashboard' | 'planner' | 'team' | 'ledger' | 'statistics' | 'settings'
const TOUR_STORAGE_KEY = 'planbaer:intro-tour:v2'

type TourStep = {
  eyebrow: string
  title: string
  text: string
  target: string | null
  page?: PageId
  workflow?: { current: number; label: string }
}

const steps = [
  { eyebrow: 'Willkommen bei PlanBär', title: 'Planen wir Ihre erste Woche', text: 'In weniger als einer Minute lernen Sie die wichtigsten Bereiche kennen. Ihre Daten bleiben dabei unverändert.', target: null },
  { eyebrow: 'Alles im Blick', title: 'Ihre Wochenübersicht', text: 'Diese Kennzahlen zeigen Teamstärke, geplante Stunden, Saldo und den aktuellen Wochenstatus.', target: '[data-tour="week-overview"]' },
  { eyebrow: 'Schritt 1', title: 'Dienstplan erstellen', text: 'Hier verteilen Sie Schichten per Vorlage, erfassen Abwesenheiten und schließen fertige Wochen ab.', target: '[data-tour="nav-planner"]' },
  { eyebrow: 'Schritt 2', title: 'Team anlegen', text: 'Verwalten Sie Mitarbeitende, Vertragsstunden und individuelle Arbeitszeiten für jeden Wochentag.', target: '[data-tour="nav-team"]' },
  { eyebrow: 'Automatisch geführt', title: 'Stunden im Griff', text: 'Das Stundenkonto übernimmt abgeschlossene Wochen und macht Plus- oder Minusstunden transparent.', target: '[data-tour="nav-ledger"]' },
  { eyebrow: 'Auswerten', title: 'Entwicklung erkennen', text: 'In der Statistik vergleichen Sie Soll-, Plan- und Ist-Zeiten für frei wählbare Zeiträume.', target: '[data-tour="nav-statistics"]' },
  { eyebrow: 'Fast geschafft', title: 'PlanBär passend einrichten', text: 'Unter Einstellungen finden Sie Darstellung, Schließtage, verschlüsselte Backups und Updates. Dort können Sie diese Tour jederzeit neu starten.', target: '[data-tour="nav-settings"]' },
  { eyebrow: 'Ihr Wochen-Workflow', title: 'Eine Woche mit PlanBär', text: 'Zum Abschluss gehen wir den typischen Ablauf einmal gemeinsam durch – von den Stammdaten bis zum fertigen Stundenkonto.', target: null },
  { eyebrow: 'Wochen-Workflow', title: 'Team und Verträge vorbereiten', text: 'Vor der Planung legen Sie alle Mitarbeitenden mit Wochenstunden und Tagesprofilen an. Das bildet die Sollzeit für die Woche.', target: '[data-tour="team-add"]', page: 'team', workflow: { current: 1, label: 'Vorbereiten' } },
  { eyebrow: 'Wochen-Workflow', title: 'Woche und Vorlagen wählen', text: 'Wählen Sie die Kalenderwoche und eine passende Schichtvorlage. Eine Vorwoche lässt sich bei Bedarf als Ausgangspunkt übernehmen.', target: '[data-tour="planner-tools"]', page: 'planner', workflow: { current: 2, label: 'Planen' } },
  { eyebrow: 'Wochen-Workflow', title: 'Schichten und Abwesenheiten eintragen', text: 'Befüllen Sie den Wochenplan. Urlaub, Krankheit und Fortbildung werden direkt am jeweiligen Tag erfasst.', target: '[data-tour="planner-board"]', page: 'planner', workflow: { current: 3, label: 'Befüllen' } },
  { eyebrow: 'Wochen-Workflow', title: 'Ist-Zeiten prüfen und abschließen', text: 'Am Ende der Woche ergänzen Sie Abweichungen und schließen die Woche ab. Danach bleibt sie nachvollziehbar und schreibgeschützt.', target: '[data-tour="week-close"], [data-tour="week-closed"]', page: 'planner', workflow: { current: 4, label: 'Abschließen' } },
  { eyebrow: 'Wochen-Workflow', title: 'Saldo im Stundenkonto prüfen', text: 'Der Wochenabschluss wird automatisch verbucht. Hier kontrollieren Sie Salden und können begründete Korrekturen dokumentieren.', target: '[data-tour="ledger-history"]', page: 'ledger', workflow: { current: 5, label: 'Kontrollieren' } },
  { eyebrow: 'Bereit zum Start', title: 'Das war’s schon', text: 'Beginnen Sie am besten mit Ihrem Team. Danach lässt sich der erste Dienstplan direkt befüllen.', target: null }
] satisfies readonly TourStep[]

type TargetRect = { top: number; left: number; right: number; bottom: number; width: number; height: number }

export function IntroTour({ navigate }: { navigate: (page: PageId) => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<TargetRect | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const start = () => { navigate('dashboard'); setStep(0); setOpen(true) }
    try {
      if (localStorage.getItem(TOUR_STORAGE_KEY) !== 'done') {
        const timer = window.setTimeout(start, 450)
        return () => window.clearTimeout(timer)
      }
    } catch { /* The tour can still be started manually. */ }
  }, [navigate])

  useEffect(() => {
    const restart = () => { navigate('dashboard'); setStep(0); setOpen(true) }
    window.addEventListener('planbaer:start-tour', restart)
    return () => window.removeEventListener('planbaer:start-tour', restart)
  }, [navigate])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const selector = steps[step].target
      const target = selector ? document.querySelector<HTMLElement>(selector) : null
      if (!target) { setRect(null); return }
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const box = target.getBoundingClientRect()
      const padding = 9
      const top = Math.max(8, box.top - padding)
      const left = Math.max(8, box.left - padding)
      const right = Math.min(window.innerWidth - 8, box.right + padding)
      const bottom = Math.min(window.innerHeight - 8, box.bottom + padding)
      setRect({ top, left, right, bottom, width: right - left, height: bottom - top })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open, step])

  function finish(destination?: PageId) {
    try { localStorage.setItem(TOUR_STORAGE_KEY, 'done') } catch { /* no-op */ }
    setOpen(false)
    if (destination) navigate(destination)
  }

  function goToStep(next: number) {
    const bounded = Math.max(0, Math.min(next, steps.length - 1))
    const destination = steps[bounded].page
    if (destination) navigate(destination)
    setStep(bounded)
  }

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
      if (event.key === 'ArrowRight' && step < steps.length - 1) goToStep(step + 1)
      if (event.key === 'ArrowLeft' && step > 0) goToStep(step - 1)
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (first && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        if (last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, step])

  if (!open) return null
  const current = steps[step]

  return <div className="tour-layer" aria-live="polite">
    {rect ? <>
      <div className="tour-shade" style={{ top: 0, left: 0, right: 0, height: rect.top }} />
      <div className="tour-shade" style={{ top: rect.bottom, left: 0, right: 0, bottom: 0 }} />
      <div className="tour-shade" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
      <div className="tour-shade" style={{ top: rect.top, left: rect.right, right: 0, height: rect.height }} />
      <div className="tour-spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
    </> : <div className="tour-shade tour-shade--full" />}
    <div ref={dialogRef} className="tour-dialog" style={getDialogPosition(rect)} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description" tabIndex={-1}>
      <div className="tour-dialog__top"><span className="tour-dialog__icon">{step === steps.length - 1 ? <Check size={21} weight="bold" /> : <PawPrint size={21} weight="fill" />}</span><button className="tour-dialog__close" onClick={() => finish()} aria-label="Tour schließen"><X size={18} /></button></div>
      {current.workflow && <div className="tour-workflow"><CalendarCheck size={17} /><span><strong>{current.workflow.current} von 5</strong>{current.workflow.label}</span><div>{[1,2,3,4,5].map((phase) => <i key={phase} className={phase <= current.workflow!.current ? 'tour-workflow__done' : undefined} />)}</div></div>}
      <p className="eyebrow">{current.eyebrow}</p><h2 id="tour-title">{current.title}</h2><p id="tour-description" className="tour-dialog__text">{current.text}</p>
      <div className="tour-progress" aria-label={`Schritt ${step + 1} von ${steps.length}`}>{steps.map((_, index) => <span key={index} className={index === step ? 'tour-progress__dot tour-progress__dot--active' : 'tour-progress__dot'} />)}<small>{step + 1} / {steps.length}</small></div>
      <div className="tour-dialog__actions">
        {step === 0 ? <button className="tour-skip" onClick={() => finish()}>Überspringen</button> : <Button variant="secondary" size="small" onClick={() => goToStep(step - 1)}><ArrowLeft size={16} /> Zurück</Button>}<span />
        {step === steps.length - 1 ? <Button size="small" onClick={() => finish('team')}>Team anlegen <Check size={16} weight="bold" /></Button> : <Button size="small" onClick={() => goToStep(step + 1)}>Weiter <ArrowRight size={16} /></Button>}
      </div>
    </div>
  </div>
}

function getDialogPosition(rect: TargetRect | null): CSSProperties {
  const width = Math.min(380, window.innerWidth - 32)
  const height = 390
  const gap = 18
  if (!rect) return { left: '50%', top: '50%', width, transform: 'translate(-50%, -50%)' }
  if (window.innerWidth - rect.right >= width + gap) return { left: rect.right + gap, top: clamp(rect.top, 16, window.innerHeight - height - 16), width }
  if (rect.left >= width + gap) return { left: rect.left - width - gap, top: clamp(rect.top, 16, window.innerHeight - height - 16), width }
  if (window.innerHeight - rect.bottom >= height + gap) return { left: clamp(rect.left, 16, window.innerWidth - width - 16), top: rect.bottom + gap, width }
  return { left: clamp(rect.left, 16, window.innerWidth - width - 16), top: 16, width }
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(value, max)) }

declare global { interface WindowEventMap { 'planbaer:start-tour': Event } }
