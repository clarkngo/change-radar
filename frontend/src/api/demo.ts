// The GitHub Pages build has no backend. It loads a snapshot exported from a real run
// (scripts/export-demo-snapshot.mjs) and answers the same API calls in the browser.
// Timestamps are shifted so the snapshot always looks recent.
import { CLOCK_SKEW_MINUTES, scoreSuspect } from './scoring'
import type { Catalog, ChangeEvent, ChangeQuery, ChangeRadarApi, ComplianceReport, Scenario, TeamCompliance } from './types'

interface Snapshot {
  exportedAt: string
  catalog: Catalog
  scenarios: Scenario[]
  changes: ChangeEvent[]
}

let loaded: Promise<Snapshot> | undefined

function snapshot(): Promise<Snapshot> {
  loaded ??= fetch(`${import.meta.env.BASE_URL}demo/snapshot.json`)
    .then((r) => r.json() as Promise<Snapshot>)
    .then((s) => {
      const shift = Date.now() - Date.parse(s.exportedAt)
      const move = (t: string) => new Date(Date.parse(t) + shift).toISOString()
      return {
        ...s,
        changes: s.changes.map((c) => ({ ...c, startedAt: move(c.startedAt) })),
        scenarios: s.scenarios.map((sc) => ({ ...sc, alertTime: move(sc.alertTime) })),
      }
    })
  return loaded
}

const time = (t: string) => Date.parse(t)

function matches(c: ChangeEvent, q: Omit<ChangeQuery, 'page' | 'size'>): boolean {
  if (q.service?.length && !q.service.includes(c.service)) return false
  if (q.team?.length && !q.team.includes(c.team)) return false
  if (q.type?.length && !q.type.includes(c.type)) return false
  if (q.from && time(c.startedAt) < time(q.from)) return false
  if (q.to && time(c.startedAt) > time(q.to)) return false
  if (q.compliant !== undefined && (c.missingMetadata.length === 0) !== q.compliant) return false
  if (q.q) {
    const haystack = [c.summary, c.service, c.author, c.ticket, c.team].join(' ').toLowerCase()
    return q.q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
  }
  return true
}

const newestFirst = (a: ChangeEvent, b: ChangeEvent) => time(b.startedAt) - time(a.startedAt)

export const demoApi: ChangeRadarApi = {
  mode: 'demo',

  catalog: async () => (await snapshot()).catalog,

  scenarios: async () => (await snapshot()).scenarios,

  async searchChanges(query) {
    const { changes } = await snapshot()
    const all = changes.filter((c) => matches(c, query)).sort(newestFirst)
    const start = query.page * query.size
    return { items: all.slice(start, start + query.size), total: all.length, page: query.page, size: query.size }
  },

  async correlate(service, at, windowMinutes) {
    const started = performance.now()
    const { changes, catalog } = await snapshot()
    const from = new Date(time(at) - windowMinutes * 60_000).toISOString()
    const to = new Date(time(at) + CLOCK_SKEW_MINUTES * 60_000).toISOString()
    const candidates = changes.filter((c) => matches(c, { from, to }))
    const suspects = candidates
      .map((c) => scoreSuspect(c, service, at, catalog))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.minutesBeforeAlert - b.minutesBeforeAlert)
      .slice(0, 10)
    return {
      alertService: service, alertTime: at, windowMinutes, changesConsidered: candidates.length,
      tookMs: Math.round(performance.now() - started), suspects,
    }
  },

  async compliance(from, to) {
    const { changes } = await snapshot()
    const inRange = changes.filter((c) => matches(c, { from, to }))
    const rate = (part: number, total: number) => (total === 0 ? 1 : Math.round((1000 * part) / total) / 1000)
    const byTeam = Map.groupBy(inRange, (c) => c.team)
    const teams: TeamCompliance[] = [...byTeam].map(([team, list]) => {
      const missing: Record<string, number> = {}
      for (const field of list.flatMap((c) => c.missingMetadata)) missing[field] = (missing[field] ?? 0) + 1
      const compliant = list.filter((c) => c.missingMetadata.length === 0).length
      return {
        team, total: list.length, compliant, rate: rate(compliant, list.length), missing,
        services: [...new Set(list.map((c) => c.service))].sort(),
      }
    }).sort((a, b) => a.rate - b.rate || a.team.localeCompare(b.team))
    const compliant = inRange.filter((c) => c.missingMetadata.length === 0).length
    const report: ComplianceReport = { from, to, total: inRange.length, overallRate: rate(compliant, inRange.length), teams }
    return report
  },
}
