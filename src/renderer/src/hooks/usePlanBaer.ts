import { useCallback, useEffect, useState } from 'react'
import type { ActionResult, AppSnapshot } from '@shared/types'

export function usePlanBaer() {
  const [data, setData] = useState<AppSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ message: string; ok: boolean } | null>(null)

  const refresh = useCallback(async () => {
    try {
      if (!window.planBaer) throw new Error('Die sichere PlanBär-Schnittstelle konnte nicht geladen werden.')
      setData(await window.planBaer.app.snapshot()); setError('')
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'PlanBär konnte die lokalen Daten nicht laden.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void refresh()
    return window.planBaer?.events.onDataChanged(() => void refresh())
  }, [refresh])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const report = useCallback((result: ActionResult) => {
    setNotice({ message: result.message, ok: result.ok })
    if (result.ok) void refresh()
    return result.ok
  }, [refresh])

  return { data, loading, error, notice, refresh, report }
}
