import type { PlanBaerApi } from '../shared/types'

declare global {
  interface Window { planBaer: PlanBaerApi }
}
