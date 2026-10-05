import { Card, Col, Progress, Row, Segmented, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { api, type ComplianceReport, type TeamCompliance } from '../api'
import { MISSING_LABEL } from '../format'

const PERIODS = { '24 hours': 1, '3 days': 3, '7 days': 7 } as const
type Period = keyof typeof PERIODS

const rateColor = (rate: number) => (rate >= 0.9 ? '#16a34a' : rate >= 0.75 ? '#d97706' : '#dc2626')

export function ComplianceView() {
  const [period, setPeriod] = useState<Period>('7 days')
  const [loaded, setLoaded] = useState<{ period: Period; report: ComplianceReport }>()
  const loading = loaded?.period !== period
  const report = loaded?.report

  useEffect(() => {
    let cancelled = false
    const to = new Date()
    const from = new Date(to.getTime() - PERIODS[period] * 86_400_000)
    api.compliance(from.toISOString(), to.toISOString()).then((r) => !cancelled && setLoaded({ period, report: r }))
    return () => { cancelled = true }
  }, [period])

  const worst = report?.teams[0]
  const columns: ColumnsType<TeamCompliance> = [
    { title: 'Team', dataIndex: 'team', width: 170, render: (t: string) => <Typography.Text strong>{t}</Typography.Text> },
    {
      title: 'Follows guidelines', dataIndex: 'rate', width: 240,
      render: (rate: number) => <Progress percent={Math.round(rate * 100)} strokeColor={rateColor(rate)} size="small" />,
    },
    { title: 'Changes', key: 'count', width: 110, render: (_, t) => `${t.compliant} / ${t.total}` },
    {
      title: 'Most often missing', dataIndex: 'missing',
      render: (missing: Record<string, number>) =>
        Object.keys(missing).length === 0 ? <Tag color="success">Nothing</Tag> : (
          <Space size={4} wrap>
            {Object.entries(missing).sort((a, b) => b[1] - a[1]).map(([field, n]) => (
              <Tag key={field} color="warning">{MISSING_LABEL[field] ?? field} × {n}</Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Services', dataIndex: 'services', responsive: ['lg'],
      render: (s: string[]) => <Typography.Text type="secondary">{s.join(', ')}</Typography.Text>,
    },
  ]

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Every site-impacting change should have a ticket, an owner and a way to roll back. Undocumented changes are what
        slow down root-cause analysis, and each team can see its own numbers here.
      </Typography.Paragraph>
      <Segmented<Period> options={Object.keys(PERIODS) as Period[]} value={period} onChange={setPeriod} />
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <Card size="small"><Statistic title="Changes following guidelines" loading={loading}
            value={Math.round((report?.overallRate ?? 0) * 100)} suffix="%"
            styles={{ content: { color: rateColor(report?.overallRate ?? 1) } }} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small"><Statistic title="Changes in period" loading={loading} value={report?.total ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small"><Statistic title="Needs the most help" loading={loading} value={worst?.team ?? '—'}
            suffix={worst ? <Typography.Text type="secondary" style={{ fontSize: 14 }}> {Math.round(worst.rate * 100)}%</Typography.Text> : null} /></Card>
        </Col>
      </Row>
      <Table<TeamCompliance> rowKey="team" size="middle" columns={columns} dataSource={report?.teams}
        loading={loading} pagination={false} scroll={{ x: 700 }} />
    </Space>
  )
}
