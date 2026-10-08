// Synthetic service metrics for the Core Metrics and Dashboard pages. Change Radar has no real metric source,
// so the series are generated deterministically from the time and the service name, with dips and spikes
// around the planted demo incidents. They exist to show change markers in context, not to be analyzed.
import type { Scenario } from './api'

export type MetricKey = 'revenue' | 'clicks' | 'errorRate' | 'latencyP99'

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
  clicks: {
    key: 'clicks', label: 'Clicks', unit: 'clicks/min', badWhen: 'down',
    format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
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

/** Positive when the change is in the metric's bad direction (revenue down, latency up). */
export const badness = (change: number, metric: MetricDef) => (metric.badWhen === 'down' ? -change : change)

/** True for metrics that add up across regions (revenue, clicks); the others are rates and are averaged. */
export const additive = (metric: MetricKey) => metric === 'revenue' || metric === 'clicks'

export interface Region {
  id: string
  label: string
  /** Share of global traffic and revenue. Shares sum to 1. */
  share: number
  /** ISO 3166-1 numeric codes of the countries drawn for this region on the map. */
  countries: string[]
}

export const REGIONS: Region[] = [
  { id: 'us', label: 'United States', share: 0.38, countries: ['840'] },
  { id: 'ca', label: 'Canada', share: 0.05, countries: ['124'] },
  { id: 'latam', label: 'Latin America', share: 0.05, countries: ['484', '076', '032', '152', '170', '604'] },
  { id: 'uki', label: 'UK & Ireland', share: 0.10, countries: ['826', '372'] },
  { id: 'dach', label: 'Germany, Austria & Switzerland', share: 0.12, countries: ['276', '040', '756'] },
  { id: 'weu', label: 'Western & Southern Europe', share: 0.09, countries: ['250', '724', '380', '528', '056', '620'] },
  { id: 'in', label: 'India', share: 0.03, countries: ['356'] },
  { id: 'jpkr', label: 'Japan & Korea', share: 0.06, countries: ['392', '410'] },
  { id: 'gc', label: 'Greater China', share: 0.04, countries: ['156', '158'] },
  { id: 'sea', label: 'Southeast Asia', share: 0.03, countries: ['458', '360', '608', '764', '704'] },
  { id: 'anz', label: 'Australia & New Zealand', share: 0.05, countries: ['036', '554'] },
]

export const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]))

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
  clicks: (s) => 2000 + hash(s, 'clk') * 10000,
  errorRate: (s) => 0.15 + hash(s, 'err') * 0.35,
  latencyP99: (s) => 120 + hash(s, 'lat') * 280,
}

const IMPACT: Record<MetricKey, (f: number) => number> = {
  revenue: (f) => 1 - 0.38 * f,
  clicks: (f) => 1 - 0.3 * f,
  errorRate: (f) => 1 + 7 * f,
  latencyP99: (f) => 1 + 2.2 * f,
}

const MINUTE = 60_000

/**
 * How hard a planted incident hits each region. Every incident has two epicentre regions, picked from its id,
 * that take the full impact (and then some); everywhere else only sees a ripple. The regional split is
 * illustrative, so it isn't reconciled with the global series.
 */
const epicentreCache = new Map<string, Set<string>>()

function regionWeight(scenario: Scenario, region: string): number {
  let epicentres = epicentreCache.get(scenario.id)
  if (!epicentres) {
    epicentres = new Set([...REGIONS].sort((a, b) => hash(scenario.id, a.id) - hash(scenario.id, b.id))
      .slice(0, 2).map((r) => r.id))
    epicentreCache.set(scenario.id, epicentres)
  }
  return epicentres.has(region) ? 1.5 : 0.1
}

/** Severity of a planted incident at time t: ramps in before the alert, recovers over ~70 minutes. */
function incidentFactor(t: number, scenarios: Scenario[], service: string, region?: string): number {
  let f = 0
  for (const s of scenarios) {
    if (s.service !== service) continue
    const alert = Date.parse(s.alertTime)
    const onset = alert - 5 * MINUTE
    const peakEnd = alert + 40 * MINUTE
    const end = alert + 75 * MINUTE
    if (t < onset || t > end) continue
    const ramp = t < alert ? (t - onset) / (alert - onset) : t <= peakEnd ? 1 : (end - t) / (end - peakEnd)
    f = Math.max(f, ramp * (region ? regionWeight(s, region) : 1))
  }
  return f
}

/** Value for a service, globally or in one region. Additive metrics are split by the region's share. */
export function valueAt(service: string, metric: MetricKey, t: number, scenarios: Scenario[], region?: string): number {
  const hourUtc = (t / 3_600_000) % 24
  const daily = 1 + 0.35 * Math.sin((2 * Math.PI * (hourUtc - 14)) / 24)
  const shape = additive(metric) ? daily : 1 + (daily - 1) * 0.4
  const noise = 1 + (hash(service, metric, ...(region ? [region] : []), Math.floor(t / MINUTE)) - 0.5) * 0.08
  const share = region && additive(metric) ? REGION_BY_ID.get(region)!.share : 1
  return BASE[metric](service) * share * shape * noise * IMPACT[metric](incidentFactor(t, scenarios, service, region))
}

export function stepFor(rangeMs: number): number {
  if (rangeMs <= 6 * 3_600_000) return MINUTE
  if (rangeMs <= 2 * 86_400_000) return 5 * MINUTE
  return 60 * MINUTE
}

export function series(service: string, metric: MetricKey, from: number, to: number, scenarios: Scenario[],
  offsetMs = 0, region?: string): Point[] {
  const step = stepFor(to - from)
  const points: Point[] = []
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    points.push({ t, v: valueAt(service, metric, t - offsetMs, scenarios, region) })
  }
  return points
}

const WEEK = 7 * 86_400_000

/** Sum over a window compared with the same window a week earlier. */
export function weekOverWeek(services: string[], metric: MetricKey, from: number, to: number, scenarios: Scenario[],
  region?: string) {
  const sum = (offset: number) => services.reduce((acc, s) =>
    acc + series(s, metric, from, to, scenarios, offset, region).reduce((a, p) => a + p.v, 0), 0)
  const current = sum(0)
  const previous = sum(WEEK)
  return { current, previous, change: previous === 0 ? 0 : (current - previous) / previous }
}
