export type ChangeType = 'DEPLOY' | 'CONFIG' | 'FEATURE_FLAG' | 'INFRA'
export type ChangeSource = 'SERVICENOW' | 'DEPLOYS' | 'FEATURE_FLAGS'
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ChangeEvent {
  id: string
  source: ChangeSource
  externalId: string
  type: ChangeType
  service: string
  team: string
  summary: string
  author: string | null
  ticket: string | null
  risk: Risk
  hasRollbackPlan: boolean
  startedAt: string
  missingMetadata: string[]
}

export interface ServiceInfo {
  team: string
  dependsOn: string[]
}

export interface Catalog {
  services: Record<string, ServiceInfo>
}

export interface ChangeQuery {
  q?: string
  service?: string[]
  team?: string[]
  type?: ChangeType[]
  from?: string
  to?: string
  compliant?: boolean
  page: number
  size: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface Suspect {
  change: ChangeEvent
  score: number
  minutesBeforeAlert: number
  dependencyDistance: number
  reasons: string[]
}

export interface CorrelationResult {
  alertService: string
  alertTime: string
  windowMinutes: number
  changesConsidered: number
  tookMs: number
  suspects: Suspect[]
}

export interface TeamCompliance {
  team: string
  total: number
  compliant: number
  rate: number
  missing: Record<string, number>
  services: string[]
}

export interface ComplianceReport {
  from: string
  to: string
  total: number
  overallRate: number
  teams: TeamCompliance[]
}

export interface Scenario {
  id: string
  title: string
  service: string
  alertTime: string
  culpritId: string
  narrative: string
}

export interface ChangeRadarApi {
  mode: 'live' | 'demo'
  catalog(): Promise<Catalog>
  scenarios(): Promise<Scenario[]>
  searchChanges(query: ChangeQuery): Promise<Page<ChangeEvent>>
  correlate(service: string, at: string, windowMinutes: number): Promise<CorrelationResult>
  compliance(from: string, to: string): Promise<ComplianceReport>
}
