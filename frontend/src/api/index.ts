import { demoApi } from './demo'
import { httpApi } from './http'

export const api = import.meta.env.VITE_DEMO === 'true' ? demoApi : httpApi
export type * from './types'
