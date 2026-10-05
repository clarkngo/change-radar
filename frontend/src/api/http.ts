import type { ChangeQuery, ChangeRadarApi } from './types'

async function get<T>(path: string, params: Record<string, string | number | boolean | string[] | undefined> = {}): Promise<T> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    for (const v of Array.isArray(value) ? value : [value]) search.append(key, String(v))
  }
  const response = await fetch(`${path}?${search}`)
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
  return response.json() as Promise<T>
}

export const httpApi: ChangeRadarApi = {
  mode: 'live',
  catalog: () => get('/api/catalog'),
  scenarios: () => get('/api/demo/scenarios'),
  searchChanges: (q: ChangeQuery) => get('/api/changes', { ...q }),
  correlate: (service, at, windowMinutes) => get('/api/correlate', { service, at, windowMinutes }),
  compliance: (from, to) => get('/api/compliance', { from, to }),
}
