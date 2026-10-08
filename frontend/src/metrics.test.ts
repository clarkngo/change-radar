import { describe, expect, it } from 'vitest'
import type { Scenario } from './api'
import { REGIONS, badness, METRICS, weekOverWeek } from './metrics'

const ALERT = Date.parse('2026-10-05T22:00:00Z')
const scenario: Scenario = {
  id: 'ads-5xx', title: 'Ad serving 5xx', service: 'ads-serving', alertTime: new Date(ALERT).toISOString(),
  culpritId: 'x', narrative: '',
}
const MINUTE = 60_000

describe('regional metrics', () => {
  it('region shares sum to 1', () => {
    expect(REGIONS.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1)
  })

  it('concentrates an incident in two epicentre regions', () => {
    const changes = REGIONS.map((r) =>
      weekOverWeek(['ads-serving'], 'revenue', ALERT, ALERT + 30 * MINUTE, [scenario], r.id).change)
    const hit = changes.filter((c) => c < -0.3)
    const ripple = changes.filter((c) => c > -0.1)
    expect(hit).toHaveLength(2)
    expect(ripple).toHaveLength(REGIONS.length - 2)
  })

  it('leaves regions alone outside an incident', () => {
    for (const r of REGIONS) {
      const { change } = weekOverWeek(['ads-serving'], 'revenue', ALERT - 6 * 60 * MINUTE, ALERT - 5 * 60 * MINUTE, [scenario], r.id)
      expect(Math.abs(change)).toBeLessThan(0.05)
    }
  })

  it('scores badness in the metric\'s bad direction', () => {
    expect(badness(-0.2, METRICS.revenue)).toBeCloseTo(0.2)
    expect(badness(0.2, METRICS.latencyP99)).toBeCloseTo(0.2)
  })
})
