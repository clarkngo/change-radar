import { Card, Col, Row, Segmented, Select, Space, Typography, theme } from 'antd'
import { useMemo, useState } from 'react'
import type { Scenario } from '../api'
import { RegionMap } from '../charts/RegionMap'
import { formatChange } from '../format'
import { METRICS, REGIONS, additive, badness, stepFor, weekOverWeek, type MetricKey } from '../metrics'
import { navigate } from '../route'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const LAST: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24 }

interface Props {
  services: string[]
  scenarios: Scenario[]
  now: number
}

/** Dashboard card: where in the world a metric moved, so a global drop can be traced to the markets behind it. */
export function RegionalImpact({ services, scenarios, now }: Props) {
  const { token } = theme.useToken()
  const recent = scenarios
    .filter((s) => now - Date.parse(s.alertTime) < 24 * HOUR)
    .sort((a, b) => Date.parse(b.alertTime) - Date.parse(a.alertTime))
  const [metric, setMetric] = useState<MetricKey>('revenue')
  // A window is either "last:<range>" or "incident:<scenario id>". Defaults to the newest incident.
  const [windowKey, setWindowKey] = useState(() => (recent[0] ? `incident:${recent[0].id}` : 'last:1h'))
  const [service, setService] = useState<string>(() => recent[0]?.service ?? 'all')

  const incident = windowKey.startsWith('incident:') ? scenarios.find((s) => `incident:${s.id}` === windowKey) : undefined
  const [from, to] = incident
    ? [Date.parse(incident.alertTime) - 10 * MINUTE, Math.min(now, Date.parse(incident.alertTime) + 40 * MINUTE)]
    : [now - LAST[windowKey.slice('last:'.length)] * HOUR, now]

  const def = METRICS[metric]
  const values = useMemo(() => {
    const scope = service === 'all' ? services : [service]
    const pointsPerSeries = Math.max(1, Math.floor((to - from) / stepFor(to - from)))
    const divisor = additive(metric) ? pointsPerSeries : pointsPerSeries * scope.length
    return new Map(REGIONS.map((r) => {
      const wow = weekOverWeek(scope, metric, from, to, scenarios, r.id)
      return [r.id, { value: wow.current / divisor, change: wow.change }]
    }))
  }, [services, service, metric, from, to, scenarios])

  const ranked = [...REGIONS].sort((a, b) => badness(values.get(b.id)!.change, def) - badness(values.get(a.id)!.change, def))

  const open = (region: string) => navigate('metrics', {
    service: service === 'all' ? undefined : service, metric, region,
    range: incident ? '3h' : windowKey === 'last:24h' ? '24h' : windowKey === 'last:6h' ? '12h' : '3h',
  })

  return (
    <Card size="small" title="Regional impact"
      extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>vs same window last week</Typography.Text>}>
      <Space wrap size={[12, 8]} style={{ marginBottom: 12 }}>
        <Segmented<MetricKey> value={metric} onChange={setMetric}
          options={Object.values(METRICS).map((m) => ({ value: m.key, label: m.label }))} />
        <Select value={service} onChange={setService} style={{ width: 180 }} showSearch
          options={[{ value: 'all', label: 'All services' }, ...services.map((s) => ({ value: s, label: s }))]} />
        <Select value={windowKey} style={{ width: 300 }}
          onChange={(key) => {
            setWindowKey(key)
            const s = scenarios.find((x) => `incident:${x.id}` === key)
            if (s) setService(s.service)
          }}
          options={[
            ...(recent.length ? [{
              label: 'Around an incident',
              options: recent.map((s) => ({ value: `incident:${s.id}`, label: `${s.title}` })),
            }] : []),
            { label: 'Rolling window', options: Object.keys(LAST).map((k) => ({ value: `last:${k}`, label: `Last ${k}` })) },
          ]} />
      </Space>
      <Row gutter={[16, 12]}>
        <Col xs={24} lg={16}>
          <RegionMap values={values} metric={def} onSelect={(r) => open(r.id)} />
        </Col>
        <Col xs={24} lg={8}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {def.label} by region, worst first{additive(metric) ? ` (${def.unit})` : ''}
          </Typography.Text>
          {ranked.map((r) => {
            const v = values.get(r.id)!
            const b = badness(v.change, def)
            return (
              <div key={r.id} role="button" tabIndex={0} onClick={() => open(r.id)}
                onKeyDown={(e) => e.key === 'Enter' && open(r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer',
                  borderBottom: `1px solid ${token.colorBorderSecondary}`, fontSize: 13,
                }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                <span style={{ color: token.colorTextSecondary, width: 64, textAlign: 'right' }}>{def.format(v.value)}</span>
                <span style={{
                  width: 64, textAlign: 'right', fontWeight: 500,
                  color: b > 0.05 ? token.colorError : b < -0.05 ? token.colorSuccess : token.colorTextSecondary,
                }}>{formatChange(v.change)}</span>
              </div>
            )
          })}
        </Col>
      </Row>
    </Card>
  )
}
