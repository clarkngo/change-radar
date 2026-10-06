import { Button, Card, DatePicker, Descriptions, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { api, type Catalog, type ChangeEvent, type ChangeType, type Page } from '../api'
import { ComplianceTags, TypeTag } from '../components'
import { MISSING_LABEL, TYPE_LABEL, formatTime, fromNow } from '../format'
import { navigate } from '../route'

const PAGE_SIZE = 20
const SOURCE_LABEL: Record<ChangeEvent['source'], string> = {
  SERVICENOW: 'Change request', DEPLOYS: 'Deploy system', FEATURE_FLAGS: 'Flag audit log',
}

export function ChangesView({ catalog, params }: { catalog: Catalog | undefined; params: URLSearchParams }) {
  const [q, setQ] = useState(params.get('q') ?? '')
  const [services, setServices] = useState<string[]>(params.get('service') ? [params.get('service')!] : [])
  const [types, setTypes] = useState<ChangeType[]>([])
  const [compliant, setCompliant] = useState<'all' | 'yes' | 'no'>('all')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [page, setPage] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; page: Page<ChangeEvent> }>()

  const query = {
    q: q || undefined,
    service: services,
    type: types,
    compliant: compliant === 'all' ? undefined : compliant === 'yes',
    from: range?.[0]?.toISOString(),
    to: range?.[1]?.toISOString(),
    page,
    size: PAGE_SIZE,
  }
  const key = JSON.stringify(query)
  const loading = loaded?.key !== key
  const data = loaded?.page

  useEffect(() => {
    let cancelled = false
    api.searchChanges(JSON.parse(key)).then((p) => !cancelled && setLoaded({ key, page: p }))
    return () => { cancelled = true }
  }, [key])

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0) }

  const columns: ColumnsType<ChangeEvent> = [
    {
      title: 'Ticket', dataIndex: 'ticket', width: 130,
      render: (t: string | null) => t ? <span className="mono">{t}</span> : <Typography.Text type="secondary">None</Typography.Text>,
    },
    { title: 'Type', dataIndex: 'type', width: 120, render: (_, c) => <TypeTag change={c} /> },
    { title: 'Service', dataIndex: 'service', width: 160 },
    {
      title: 'Start', dataIndex: 'startedAt', width: 150,
      render: (t: string) => <Tooltip title={fromNow(t)}><span className="mono">{formatTime(t)}</span></Tooltip>,
    },
    { title: 'Owner', dataIndex: 'author', width: 110, responsive: ['lg'] },
    { title: 'Summary', dataIndex: 'summary', width: 320, ellipsis: { showTitle: true } },
    { title: 'Guidelines', key: 'compliance', width: 190, responsive: ['md'], render: (_, c) => <ComplianceTags change={c} /> },
  ]

  return (
    <Card size="small">
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Search summary, owner, ticket" allowClear defaultValue={q}
          onSearch={resetPage(setQ)} style={{ width: 260 }} />
        <Select mode="multiple" allowClear placeholder="Services" value={services} onChange={resetPage(setServices)}
          options={Object.keys(catalog?.services ?? {}).sort().map((s) => ({ value: s, label: s }))}
          style={{ minWidth: 180 }} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="Change types" value={types} onChange={resetPage(setTypes)}
          options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} style={{ minWidth: 160 }} />
        <Select value={compliant} onChange={resetPage(setCompliant)} style={{ width: 180 }} options={[
          { value: 'all', label: 'All changes' },
          { value: 'yes', label: 'Follows guidelines' },
          { value: 'no', label: 'Missing metadata' },
        ]} />
        <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="MMM D HH:mm" onChange={resetPage(setRange)} />
      </Space>
      <Table<ChangeEvent>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={data?.items}
        loading={loading}
        scroll={{ x: 1150 }}
        expandable={{
          expandedRowRender: (c) => (
            <Descriptions size="small" column={{ xs: 1, md: 2, xl: 3 }} bordered>
              <Descriptions.Item label="Summary" span={3}>{c.summary}</Descriptions.Item>
              <Descriptions.Item label="Source">{SOURCE_LABEL[c.source]}</Descriptions.Item>
              <Descriptions.Item label="External id"><span className="mono">{c.externalId}</span></Descriptions.Item>
              <Descriptions.Item label="Team">{c.team}</Descriptions.Item>
              <Descriptions.Item label="Risk"><Tag color={c.risk === 'HIGH' ? 'red' : undefined}>{c.risk}</Tag></Descriptions.Item>
              <Descriptions.Item label="Rollback plan">{c.hasRollbackPlan ? 'Yes' : 'No'}</Descriptions.Item>
              <Descriptions.Item label="Missing">
                {c.missingMetadata.length ? c.missingMetadata.map((m) => MISSING_LABEL[m] ?? m).join(', ') : 'Nothing'}
              </Descriptions.Item>
              <Descriptions.Item label="Actions" span={3}>
                <Space wrap>
                  <Button size="small" onClick={() => navigate('metrics', { service: c.service, range: '24h' })}>
                    View {c.service} metrics
                  </Button>
                  <Button size="small" onClick={() => navigate('investigate', {
                    service: c.service, at: new Date(Date.parse(c.startedAt) + 10 * 60_000).toISOString(),
                  })}>
                    Investigate an alert 10 min later
                  </Button>
                </Space>
              </Descriptions.Item>
            </Descriptions>
          ),
        }}
        pagination={{
          current: page + 1, pageSize: PAGE_SIZE, total: data?.total, showSizeChanger: false, size: 'small',
          showTotal: (total) => `${total} changes`, onChange: (p) => setPage(p - 1),
        }}
      />
    </Card>
  )
}
