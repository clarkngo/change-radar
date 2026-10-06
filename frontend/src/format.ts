import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { ChangeType, Risk } from './api'

dayjs.extend(relativeTime)

export const TYPE_LABEL: Record<ChangeType, string> = {
  DEPLOY: 'Deploy', CONFIG: 'Config', FEATURE_FLAG: 'Feature flag', INFRA: 'Infra',
}
export const TYPE_COLOR: Record<ChangeType, string> = {
  DEPLOY: 'blue', CONFIG: 'purple', FEATURE_FLAG: 'cyan', INFRA: 'gold',
}
export const RISK_COLOR: Record<Risk, string> = { LOW: 'default', MEDIUM: 'processing', HIGH: 'error' }

export const MISSING_LABEL: Record<string, string> = {
  ticket: 'No ticket', rollbackPlan: 'No rollback plan', owner: 'No owner',
}

export const fromNow = (iso: string) => dayjs(iso).fromNow()
export const formatTime = (iso: string) => dayjs(iso).format('MMM D, HH:mm')

export function scoreColor(score: number): string {
  if (score >= 50) return '#dc2626'
  if (score >= 20) return '#ea580c'
  return '#8c8c8c'
}

/** Solid colors for chart markers, matching the tag colors above. */
export const TYPE_COLOR_HEX: Record<ChangeType, string> = {
  DEPLOY: '#1677ff', CONFIG: '#722ed1', FEATURE_FLAG: '#13a8a8', INFRA: '#d48806',
}
