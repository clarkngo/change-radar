import { AlertOutlined, ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { Badge, Button, Card, Col, Empty, Row, Space, Tag, Typography, theme } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { api, type Catalog, type ChangeEvent, type Scenario } from '../api'
import { TypeTag } from '../components'
import { formatTime, fromNow } from '../format'
import { METRICS, weekOverWeek, type MetricKey } from '../metrics'
import { navigate } from '../route'

const HOUR = 3_600_000

const KPIS: { title: string; services: string[]; metric: MetricKey; average?: boolean }[] = [
  { title: 'Ads revenue', services: ['ads-serving'], metric: 'revenue' },
  { title: 'Checkout revenue', services: ['checkout'], metric: 'revenue' },
  { title: 'Search p99 latency', services: ['search-api'], metric: 'latencyP99', average: true },
  { title: 'Checkout error rate', services: ['checkout'], metric: 'errorRate', average: true },
]

type Health = 'Critical' | 'Warning' | 'Healthy'
const HEALTH_COLOR: Record<Health, string> = { Critical: '#f5222d', Warning: '#faad14', Healthy: '#36cfc9' }

function healthOf(service: string, scenarios: Scenario[], now: number): Health {
  const ages = scenarios.filter((s) => s.service === service).map((s) => now - Date.parse(s.alertTime))
  if (ages.some((a) => a >= 0 && a < HOUR)) return 'Critical'
  if (ages.some((a) => a >= 0 && a < 24 * HOUR)) return 'Warning'
  return 'Healthy'
}

export function DashboardView({ catalog }: { catalog: Catalog | undefined }) {
  const { token } = theme.useToken()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [recent, setRecent] = useState<ChangeEvent[]>([])
  const [now] = useState(() => Date.now())

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => setScenarios([]))
    api.searchChanges({ page: 0, size: 6 }).then((p) => setRecent(p.items))
  }, [])

  const kpis = useMemo(() => KPIS.map((k) => {
    const wow = weekOverWeek(k.services, k.metric, now - 24 * HOUR, now, scenarios)
    const points = (24 * HOUR) / (5 * 60_000) * k.services.length
    const value = k.average ? wow.current / points : wow.current
    return { ...k, value, change: wow.change }
  }), [now, scenarios])

  const services = Object.keys(catalog?.services ?? {}).sort()
  const incidents = scenarios
    .filter((s) => now - Date.parse(s.alertTime) < 24 * HOUR)
    .sort((a, b) => Date.parse(b.alertTime) - Date.parse(a.alertTime))

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Row gutter={[12, 12]}>
        {kpis.map((k) => {
          const def = METRICS[k.metric]
          const bad = def.badWhen === 'down' ? k.change < 0 : k.change > 0
          const formatted = k.metric === 'revenue' ? `$${Math.round(k.value).toLocaleString()}` : def.format(k.value)
          return (
            <Col key={k.title} xs={24} sm={12} lg={6}>
              <Card size="small" hoverable onClick={() => navigate('metrics', { service: k.services[0], metric: k.metric, range: '24h' })}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Last 24 hours · {k.title}</Typography.Text>
                <div style={{ fontSize: 26, fontWeight: 600, margin: '2px 0' }}>{formatted}</div>
                <span style={{ fontSize: 12, color: bad ? token.colorError : token.colorSuccess }}>
                  {k.change >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(k.change * 100).toFixed(2)}%
                </span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}> vs last week</Typography.Text>
              </Card>
            </Col>
          )
        })}
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="Service health" style={{ height: '100%' }}
            extra={<Space size={12}>{(Object.keys(HEALTH_COLOR) as Health[]).map((h) => (
              <Badge key={h} color={HEALTH_COLOR[h]} text={<span style={{ fontSize: 12 }}>{h}</span>} />
            ))}</Space>}>
            <Row gutter={[8, 8]}>
              {services.map((s) => {
                const h = healthOf(s, scenarios, now)
                return (
                  <Col key={s} xs={12} sm={8} md={6}>
                    <div onClick={() => navigate('metrics', { service: s })} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate('metrics', { service: s })}
                      style={{
                        cursor: 'pointer', padding: '8px 10px', borderRadius: token.borderRadius,
                        border: `1px solid ${token.colorBorderSecondary}`, borderLeft: `4px solid ${HEALTH_COLOR[h]}`,
                        background: token.colorFillQuaternary,
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</div>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{catalog?.services[s].team}</div>
                    </div>
                  </Col>
                )
              })}
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" style={{ height: '100%' }}
            title={<Space>Active incidents <Badge count={incidents.length} /></Space>}>
            {incidents.length === 0 ? <Empty description="No incidents in the last 24 hours" /> : (
              <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                {incidents.map((s) => {
                  const recentAlert = now - Date.parse(s.alertTime) < HOUR
                  return (
                    <div key={s.id} style={{ padding: 10, borderRadius: token.borderRadius, border: `1px solid ${token.colorBorderSecondary}` }}>
                      <Space size={6} wrap>
                        <Tag color={recentAlert ? 'red' : 'orange'}>{recentAlert ? 'P1' : 'P2'}</Tag>
                        <Typography.Text strong><AlertOutlined /> {s.title}</Typography.Text>
                      </Space>
                      <div style={{ fontSize: 12, color: token.colorTextSecondary, margin: '4px 0 6px' }}>
                        {s.service} · fired {fromNow(s.alertTime)}
                      </div>
                      <Button size="small" type="primary" ghost
                        onClick={() => navigate('investigate', { service: s.service, at: s.alertTime })}>
                        What changed?
                      </Button>
                    </div>
                  )
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Recent changes"
        extra={<Button type="link" size="small" onClick={() => navigate('changes')}>All changes <ArrowRightOutlined /></Button>}>
        {recent.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, width: 96, flexShrink: 0 }}>{formatTime(c.startedAt)}</Typography.Text>
            <TypeTag change={c} />
            <Tag>{c.service}</Tag>
            <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>{c.summary}</Typography.Text>
          </div>
        ))}
      </Card>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Metrics and health are synthetic, derived from the demo incidents. Changes come from the Change Radar index.
      </Typography.Text>
    </Space>
  )
}
