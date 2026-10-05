import { DatePicker, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { api, type Catalog, type ChangeEvent, type ChangeType, type Page } from '../api'
import { ComplianceTags, TypeTag } from '../components'
import { TYPE_LABEL, formatTime, fromNow } from '../format'

const PAGE_SIZE = 15

export function ChangesView({ catalog }: { catalog: Catalog | undefined }) {
  const [q, setQ] = useState('')
  const [services, setServices] = useState<string[]>([])
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
      title: 'Started', dataIndex: 'startedAt', width: 130,
      render: (t: string) => <Tooltip title={formatTime(t)}>{fromNow(t)}</Tooltip>,
    },
    {
      title: 'Service', dataIndex: 'service', width: 170,
      render: (_, c) => <><Tag>{c.service}</Tag><div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.team}</Typography.Text></div></>,
    },
    { title: 'Type', dataIndex: 'type', width: 120, render: (_, c) => <TypeTag change={c} /> },
    { title: 'Change', dataIndex: 'summary', render: (s: string) => <Typography.Text>{s}</Typography.Text> },
    { title: 'Author', dataIndex: 'author', width: 110, responsive: ['lg'] },
    { title: 'Guidelines', key: 'compliance', width: 200, render: (_, c) => <ComplianceTags change={c} /> },
  ]

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Input.Search placeholder="Search summary, author, ticket" allowClear onSearch={resetPage(setQ)} style={{ width: 280 }} />
        <Select mode="multiple" allowClear placeholder="Services" value={services} onChange={resetPage(setServices)}
          options={Object.keys(catalog?.services ?? {}).sort().map((s) => ({ value: s, label: s }))}
          style={{ minWidth: 200 }} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="Types" value={types} onChange={resetPage(setTypes)}
          options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} style={{ minWidth: 160 }} />
        <Select value={compliant} onChange={resetPage(setCompliant)} style={{ width: 190 }} options={[
          { value: 'all', label: 'All changes' },
          { value: 'yes', label: 'Follows guidelines' },
          { value: 'no', label: 'Missing metadata' },
        ]} />
        <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="MMM D HH:mm" onChange={resetPage(setRange)} />
      </Space>
      <Table<ChangeEvent>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={data?.items}
        loading={loading}
        scroll={{ x: 800 }}
        pagination={{
          current: page + 1, pageSize: PAGE_SIZE, total: data?.total, showSizeChanger: false,
          showTotal: (total) => `${total} changes`, onChange: (p) => setPage(p - 1),
        }}
      />
    </Space>
  )
}
