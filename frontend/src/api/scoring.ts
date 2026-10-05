// A copy of SuspectScorer.java for the static GitHub Pages demo, which has no backend.
// Both versions are tested against shared/scoring-cases.json so they stay in sync.
import type { Catalog, ChangeEvent, ChangeType, Risk, Suspect } from './types'

export const HALF_LIFE_MINUTES = 15
export const CLOCK_SKEW_MINUTES = 5

export function dependencyDistance(catalog: Catalog, from: string, to: string): number {
  if (from === to) return 0
  const depth = new Map<string, number>([[from, 0]])
  const queue = [from]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const dep of catalog.services[current]?.dependsOn ?? []) {
      if (depth.has(dep)) continue
      const d = depth.get(current)! + 1
      if (dep === to) return d
      depth.set(dep, d)
      queue.push(dep)
    }
  }
  return -1
}

function blastWeight(distance: number, type: ChangeType): number {
  switch (distance) {
    case 0: return 1.0
    case 1: return 0.7
    case 2: return 0.4
    case -1: return type === 'INFRA' ? 0.3 : 0.1
    default: return 0.2
  }
}

const TYPE_WEIGHT: Record<ChangeType, number> = { DEPLOY: 1.0, CONFIG: 0.9, INFRA: 0.9, FEATURE_FLAG: 0.85 }
const RISK_FACTOR: Record<Risk, number> = { HIGH: 1.2, MEDIUM: 1.0, LOW: 0.85 }

export function scoreSuspect(change: ChangeEvent, alertService: string, alertTime: string, catalog: Catalog): Suspect {
  const reasons: string[] = []
  const seconds = Math.floor((Date.parse(alertTime) - Date.parse(change.startedAt)) / 1000)
  const minutesBefore = seconds / 60

  let proximity: number
  if (minutesBefore < 0) {
    proximity = 0.3
    reasons.push(`Started ${Math.round(-minutesBefore)} min after the alert (possible clock skew)`)
  } else {
    proximity = Math.pow(0.5, minutesBefore / HALF_LIFE_MINUTES)
    reasons.push(`Started ${Math.round(minutesBefore)} min before the alert`)
  }

  const distance = dependencyDistance(catalog, alertService, change.service)
  if (distance === 0) reasons.push('Same service as the alert')
  else if (distance === 1) reasons.push(`${alertService} depends on ${change.service}`)
  else if (distance === -1) reasons.push(change.type === 'INFRA' ? 'Shared infrastructure change' : 'No known dependency')
  else reasons.push(`${change.service} is ${distance} hops upstream of ${alertService}`)

  if (change.risk === 'HIGH') reasons.push('Declared high risk')
  if (change.missingMetadata.length > 0) reasons.push(`Missing ${change.missingMetadata.join(', ')}`)

  const raw = proximity * blastWeight(distance, change.type) * TYPE_WEIGHT[change.type] * RISK_FACTOR[change.risk]
  return {
    change,
    score: Math.round(100 * Math.min(1, raw)),
    minutesBeforeAlert: minutesBefore,
    dependencyDistance: distance,
    reasons,
  }
}
