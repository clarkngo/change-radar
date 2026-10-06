import { Alert, Card, Checkbox, Col, Row, Segmented, Select, Space, Switch, Tag, Typography, theme } from 'antd'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Catalog, type ChangeEvent, type ChangeType, type Scenario } from '../api'
import { MetricChart, type Series } from '../charts/MetricChart'
import { dependencyDistance } from '../api/scoring'
import { TYPE_COLOR_HEX, TYPE_LABEL } from '../format'
import { METRICS, series as buildSeries, type MetricKey } from '../metrics'
import { navigate } from '../route'

const RANGES = { '1h': 1, '3h': 3, '12h': 12, '24h': 24, '3d': 72, '7d': 168 } as const
type RangeKey = keyof typeof RANGES
const WEEK = 7 * 86_400_000

function Row_({ label, children }: { label: string; children: ReactNode }) {
  const { token } = theme.useToken()
  return (
    <Row gutter={12} align="middle" style={{ marginBottom: 12 }}>
      <Col flex="96px">
        <span style={{ borderLeft: `3px solid ${token.colorPrimary}`, paddingLeft: 8, fontWeight: 500 }}>{label}</span>
      </Col>
      <Col flex="auto">{children}</Col>
    </Row>
  )
}

export function MetricsView({ catalog, params }: { catalog: Catalog | undefined; params: URLSearchParams }) {
  const { token } = theme.useToken()
  const [service, setService] = useState(params.get('service') ?? 'ads-serving')
  const [metric, setMetric] = useState<MetricKey>((params.get('metric') as MetricKey) ?? 'revenue')
  const [range, setRange] = useState<RangeKey>((params.get('range') as RangeKey) ?? '3h')
  const [compare, setCompare] = useState(true)
  const [showChanges, setShowChanges] = useState(true)
  const [withDeps, setWithDeps] = useState(true)
  const [changeTypes, setChangeTypes] = useState<ChangeType[]>([])
  const [showAlerts, setShowAlerts] = useState(true)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [changes, setChanges] = useState<ChangeEvent[]>([])
  // Fixed "now" per range selection, so the window doesn't drift while the user hovers.
  const [now] = useState(() => Date.now())

  const to = now
  const from = now - RANGES[range] * 3_600_000

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => setScenarios([]))
  }, [])

  const services = Object.keys(catalog?.services ?? {}).sort()
  const scope = useMemo(() => {
    if (!catalog || !withDeps) return [service]
    return services.filter((s) => dependencyDistance(catalog, service, s) >= 0)
  }, [catalog, service, withDeps, services])

  useEffect(() => {
    let cancelled = false
    api.searchChanges({
      service: scope, type: changeTypes, from: new Date(from).toISOString(), to: new Date(to).toISOString(), page: 0, size: 200,
    }).then((p) => !cancelled && setChanges(p.items))
    return () => { cancelled = true }
  }, [scope, changeTypes, from, to])

  const def = METRICS[metric]
  const chartSeries: Series[] = [
    { name: `${service} · ${def.label}`, color: token.colorPrimary, points: buildSeries(service, metric, from, to, scenarios) },
    ...(compare ? [{
      name: '7 days ago', color: token.colorTextTertiary, dashed: true,
      points: buildSeries(service, metric, from, to, scenarios, WEEK),
    }] : []),
  ]
  const alerts = showAlerts
    ? scenarios.filter((s) => s.service === service).map((s) => ({ t: Date.parse(s.alertTime), label: s.title }))
    : []
  const visible = showChanges ? changes : []

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small" title={<span style={{ color: token.colorPrimary }}>All Filters</span>}>
        <Row_ label="Time">
          <Segmented<RangeKey> options={Object.keys(RANGES) as RangeKey[]} value={range} onChange={setRange} />
        </Row_>
        <Row_ label="Metric">
          <Select value={metric} onChange={setMetric} style={{ width: 220 }}
            options={Object.values(METRICS).map((m) => ({ value: m.key, label: `${m.label} (${m.unit})` }))} />
        </Row_>
        <Row_ label="Filters">
          <Select showSearch value={service} onChange={setService} style={{ width: 220 }}
            options={services.map((s) => ({ value: s, label: s }))} />
        </Row_>
        <Row_ label="Tools">
          <Space wrap size="large">
            <Space size={6}><Switch size="small" checked={compare} onChange={setCompare} /> Compare history <Tag>7d</Tag></Space>
            <Space size={6} wrap>
              <Switch size="small" checked={showChanges} onChange={setShowChanges} /> Show changes
              <Select mode="multiple" allowClear size="small" placeholder="All change types" disabled={!showChanges}
                value={changeTypes} onChange={setChangeTypes} style={{ minWidth: 170 }} maxTagCount="responsive"
                options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              <Checkbox checked={withDeps} disabled={!showChanges} onChange={(e) => setWithDeps(e.target.checked)}>
                include dependencies
              </Checkbox>
            </Space>
            <Space size={6}><Switch size="small" checked={showAlerts} onChange={setShowAlerts} /> Show alerts</Space>
          </Space>
        </Row_>
      </Card>

      <Card size="small"
        title={`${def.label} · ${service}`}
        extra={showChanges && (
          <Space size={10} wrap>
            {(Object.keys(TYPE_LABEL) as ChangeType[]).map((t) => (
              <span key={t} style={{ fontSize: 12 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: TYPE_COLOR_HEX[t], marginRight: 4 }} />
                {TYPE_LABEL[t]}
              </span>
            ))}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{visible.length} changes</Typography.Text>
          </Space>
        )}>
        <MetricChart
          series={chartSeries} changes={visible} alerts={alerts} from={from} to={to} format={def.format}
          onChangeClick={(c) => navigate('changes', { q: c.ticket ?? c.summary.split(':')[0] })}
          onAlertClick={(t) => navigate('investigate', { service, at: new Date(t).toISOString() })}
        />
        <Alert type="info" showIcon style={{ marginTop: 8 }}
          title="Hover a marker to see the change. Click an alert (red) to rank the changes most likely behind it." />
      </Card>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Metrics on this page are synthetic, generated to show change markers in context. Changes and alerts come from the
        Change Radar index.
      </Typography.Text>
    </Space>
  )
}
