import { AlertOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, DatePicker, Empty, Flex, Form, Row, Select, Space, Tag, Typography, theme } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { api, type Catalog, type CorrelationResult, type Scenario, type Suspect } from '../api'
import { ComplianceTags, TypeTag } from '../components'
import { formatTime, fromNow, scoreColor } from '../format'

const WINDOWS = [30, 60, 120, 240]

export function InvestigateView({ catalog }: { catalog: Catalog | undefined }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [service, setService] = useState<string>()
  const [alertTime, setAlertTime] = useState<Dayjs>(dayjs())
  const [windowMinutes, setWindowMinutes] = useState(120)
  const [result, setResult] = useState<CorrelationResult>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => setScenarios([]))
  }, [])

  async function investigate(svc = service, at = alertTime, win = windowMinutes) {
    if (!svc) return
    setLoading(true)
    setError(undefined)
    try {
      setResult(await api.correlate(svc, at.toISOString(), win))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function runScenario(s: Scenario) {
    const at = dayjs(s.alertTime)
    setService(s.service)
    setAlertTime(at)
    void investigate(s.service, at, windowMinutes)
  }

  const services = Object.keys(catalog?.services ?? {}).sort()

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {scenarios.length > 0 && (
        <div>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            <ThunderboltOutlined /> Recent incidents
          </Typography.Title>
          <Row gutter={[12, 12]}>
            {scenarios.map((s) => (
              <Col key={s.id} xs={24} md={8}>
                <Card size="small" hoverable onClick={() => runScenario(s)} style={{ height: '100%' }}>
                  <Space orientation="vertical" size={4}>
                    <Typography.Text strong><AlertOutlined style={{ color: '#dc2626' }} /> {s.title}</Typography.Text>
                    <Space size={4} wrap>
                      <Tag>{s.service}</Tag>
                      <Typography.Text type="secondary">fired {fromNow(s.alertTime)}</Typography.Text>
                    </Space>
                    <Button size="small" type="link" style={{ padding: 0 }}>What changed?</Button>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}

      <Card size="small" title="Investigate an alert">
        <Form layout="inline" onFinish={() => investigate()} style={{ rowGap: 12 }}>
          <Form.Item label="Alerting service" required>
            <Select
              showSearch
              placeholder="Pick a service"
              value={service}
              onChange={setService}
              options={services.map((s) => ({ value: s, label: s }))}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label="Alert fired at">
            <DatePicker showTime={{ format: 'HH:mm' }} format="MMM D, HH:mm" value={alertTime}
              onChange={(d) => d && setAlertTime(d)} allowClear={false} />
          </Form.Item>
          <Form.Item label="Look back">
            <Select value={windowMinutes} onChange={setWindowMinutes} style={{ width: 110 }}
              options={WINDOWS.map((w) => ({ value: w, label: w < 60 ? `${w} min` : `${w / 60} h` }))} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading} disabled={!service}>
              Find suspects
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {error && <Alert type="error" title="Correlation failed" description={error} showIcon />}
      {result && <Results result={result} scenario={scenarios.find((s) => s.service === result.alertService && s.alertTime === result.alertTime)} />}
    </Space>
  )
}

function Results({ result, scenario }: { result: CorrelationResult; scenario?: Scenario }) {
  return (
    <Card
      title={<>Suspects for <Tag color="red">{result.alertService}</Tag>alert at {formatTime(result.alertTime)}</>}
      extra={<Typography.Text type="secondary">{result.changesConsidered} changes checked in {result.tookMs} ms</Typography.Text>}
    >
      {result.suspects.length === 0 ? (
        <Empty description="No changes in this window. Try a longer look-back." />
      ) : (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Timeline result={result} />
          {result.suspects.map((s, i) => (
            <SuspectRow key={s.change.id} suspect={s} rank={i + 1} confirmed={scenario?.culpritId === s.change.id} />
          ))}
          {scenario && (
            <Alert type="info" showIcon title="About this demo incident" description={scenario.narrative} />
          )}
        </Space>
      )}
    </Card>
  )
}

function SuspectRow({ suspect, rank, confirmed }: { suspect: Suspect; rank: number; confirmed: boolean }) {
  const { token } = theme.useToken()
  const c = suspect.change
  const color = scoreColor(suspect.score)
  return (
    <Flex gap={16} align="flex-start" style={{
      padding: 12, borderRadius: token.borderRadiusLG,
      border: `1px solid ${rank === 1 ? color : token.colorBorderSecondary}`,
      background: rank === 1 ? token.colorErrorBg : undefined,
    }}>
      <Flex vertical align="center" style={{ minWidth: 56 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>#{rank}</Typography.Text>
        <span style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1.1 }}>{suspect.score}</span>
        <div style={{ width: 44, height: 4, borderRadius: 2, background: token.colorFillSecondary, marginTop: 4 }}>
          <div style={{ width: `${suspect.score}%`, height: '100%', borderRadius: 2, background: color }} />
        </div>
      </Flex>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={6} wrap style={{ marginBottom: 4 }}>
          <Typography.Text strong>{c.summary}</Typography.Text>
          {confirmed && <Tag color="green">Actual cause</Tag>}
        </Space>
        <Space size={4} wrap style={{ marginBottom: 6 }}>
          <Tag>{c.service}</Tag>
          <TypeTag change={c} />
          {c.risk === 'HIGH' && <Tag color="error">High risk</Tag>}
          <ComplianceTags change={c} />
        </Space>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {formatTime(c.startedAt)} · {c.author || 'unknown author'}{c.ticket ? ` · ${c.ticket}` : ''}
          </Typography.Text>
        </div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {suspect.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </Flex>
  )
}

/** Changes plotted on a time axis ending at the alert, with dot size and color showing the score. */
function Timeline({ result }: { result: CorrelationResult }) {
  const { token } = theme.useToken()
  const W = 1000
  const H = 70
  const pad = 24
  const minMin = -result.windowMinutes
  const maxMin = 5
  const x = (minutesFromAlert: number) => pad + ((minutesFromAlert - minMin) / (maxMin - minMin)) * (W - 2 * pad)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(minMin * f))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Suspect changes on a timeline before the alert">
      <line x1={pad} x2={W - pad} y1={34} y2={34} stroke={token.colorBorder} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={30} y2={38} stroke={token.colorBorder} />
          <text x={x(t)} y={56} textAnchor="middle" fontSize={12} fill={token.colorTextSecondary}>
            {t === 0 ? 'alert' : `${t} min`}
          </text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={8} y2={42} stroke="#dc2626" strokeWidth={2} />
      {[...result.suspects].reverse().map((s) => (
        <circle key={s.change.id} cx={x(-s.minutesBeforeAlert)} cy={34} r={4 + s.score / 10}
          fill={scoreColor(s.score)} fillOpacity={0.75} stroke={token.colorBgContainer} strokeWidth={1.5}>
          <title>{`${s.score}: ${s.change.summary}`}</title>
        </circle>
      ))}
    </svg>
  )
}
