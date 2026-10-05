import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { scoreSuspect } from './scoring'
import type { ChangeEvent, ChangeType, Risk, ServiceInfo } from './types'

interface SharedCases {
  alertService: string
  alertTime: string
  catalog: Record<string, ServiceInfo>
  cases: {
    name: string
    change: { service: string; type: ChangeType; risk: Risk; minutesBeforeAlert: number }
    expectedScore: number
    expectedDistance: number
  }[]
}

// The same vectors drive SuspectScorerTest.java.
const shared: SharedCases = JSON.parse(
  readFileSync(new URL('../../../shared/scoring-cases.json', import.meta.url), 'utf8'),
)

describe('scoreSuspect matches the backend', () => {
  it.each(shared.cases)('$name', (c) => {
    const startedAt = new Date(Date.parse(shared.alertTime) - c.change.minutesBeforeAlert * 60_000).toISOString()
    const change: ChangeEvent = {
      id: 'test', source: 'DEPLOYS', externalId: 'test', type: c.change.type, service: c.change.service,
      team: 't', summary: 's', author: 'a', ticket: 'T-1', risk: c.change.risk, hasRollbackPlan: true,
      startedAt, missingMetadata: [],
    }
    const suspect = scoreSuspect(change, shared.alertService, shared.alertTime, { services: shared.catalog })
    expect(suspect.score).toBe(c.expectedScore)
    expect(suspect.dependencyDistance).toBe(c.expectedDistance)
  })
})
