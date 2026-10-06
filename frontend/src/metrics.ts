// Synthetic service metrics for the Core Metrics and Dashboard pages. Change Radar has no real metric source,
// so the series are generated deterministically from the time and the service name, with dips and spikes
// around the planted demo incidents. They exist to show change markers in context, not to be analyzed.
import type { Scenario } from './api'

export type MetricKey = 'revenue' | 'errorRate' | 'latencyP99'

export interface MetricDef {
  key: MetricKey
  label: string
  unit: string
  format: (v: number) => string
  /** Direction that's bad, used for week-over-week coloring. */
  badWhen: 'down' | 'up'
}

export const METRICS: Record<MetricKey, MetricDef> = {
  revenue: {
    key: 'revenue', label: 'Revenue', unit: '$/min', badWhen: 'down',
    format: (v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`,
  },
  errorRate: {
    key: 'errorRate', label: 'Error rate', unit: '%', badWhen: 'up',
    format: (v) => `${v.toFixed(2)}%`,
  },
  latencyP99: {
    key: 'latencyP99', label: 'p99 latency', unit: 'ms', badWhen: 'up',
    format: (v) => `${v.toFixed(0)} ms`,
  },
}

export interface Point {
  t: number
  v: number
}

/** Small deterministic hash so the same service and time always produce the same value. */
function hash(...parts: (string | number)[]): number {
  let h = 2166136261
  for (const c of parts.join('|')) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  // Final avalanche (murmur3 fmix32) so neighbouring inputs don't produce correlated outputs.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const BASE: Record<MetricKey, (service: string) => number> = {
  revenue: (s) => 400 + hash(s, 'rev') * 2600,
  errorRate: (s) => 0.15 + hash(s, 'err') * 0.35,
  latencyP99: (s) => 120 + hash(s, 'lat') * 280,
}

const IMPACT: Record<MetricKey, (f: number) => number> = {
  revenue: (f) => 1 - 0.38 * f,
  errorRate: (f) => 1 + 7 * f,
  latencyP99: (f) => 1 + 2.2 * f,
}

const MINUTE = 60_000

/** 0..1 severity of a planted incident at time t: ramps in before the alert, recovers over ~70 minutes. */
function incidentFactor(t: number, scenarios: Scenario[], service: string): number {
  let f = 0
  for (const s of scenarios) {
    if (s.service !== service) continue
    const alert = Date.parse(s.alertTime)
    const onset = alert - 5 * MINUTE
    const peakEnd = alert + 40 * MINUTE
    const end = alert + 75 * MINUTE
    if (t < onset || t > end) continue
    if (t < alert) f = Math.max(f, (t - onset) / (alert - onset))
    else if (t <= peakEnd) f = 1
    else f = Math.max(f, (end - t) / (end - peakEnd))
  }
  return f
}

export function valueAt(service: string, metric: MetricKey, t: number, scenarios: Scenario[]): number {
  const hourUtc = (t / 3_600_000) % 24
  const daily = 1 + 0.35 * Math.sin((2 * Math.PI * (hourUtc - 14)) / 24)
  const shape = metric === 'revenue' ? daily : 1 + (daily - 1) * 0.4
  const noise = 1 + (hash(service, metric, Math.floor(t / MINUTE)) - 0.5) * 0.08
  return BASE[metric](service) * shape * noise * IMPACT[metric](incidentFactor(t, scenarios, service))
}

export function stepFor(rangeMs: number): number {
  if (rangeMs <= 6 * 3_600_000) return MINUTE
  if (rangeMs <= 2 * 86_400_000) return 5 * MINUTE
  return 60 * MINUTE
}

export function series(service: string, metric: MetricKey, from: number, to: number, scenarios: Scenario[],
  offsetMs = 0): Point[] {
  const step = stepFor(to - from)
  const points: Point[] = []
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    points.push({ t, v: valueAt(service, metric, t - offsetMs, scenarios) })
  }
  return points
}

const WEEK = 7 * 86_400_000

/** Sum over a window compared with the same window a week earlier. */
export function weekOverWeek(services: string[], metric: MetricKey, from: number, to: number, scenarios: Scenario[]) {
  const sum = (offset: number) => services.reduce((acc, s) =>
    acc + series(s, metric, from, to, scenarios, offset).reduce((a, p) => a + p.v, 0), 0)
  const current = sum(0)
  const previous = sum(WEEK)
  return { current, previous, change: previous === 0 ? 0 : (current - previous) / previous }
}
