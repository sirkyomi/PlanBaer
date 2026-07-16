import type { PlanBaerApi } from '../../shared/types'

declare module '*.css'

declare global { interface Window { planBaer: PlanBaerApi } }
export {}
