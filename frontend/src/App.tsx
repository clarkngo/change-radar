import {
  AimOutlined, ClockCircleOutlined, DashboardOutlined, GithubOutlined, HistoryOutlined, LineChartOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { App as AntApp, ConfigProvider, Grid, Layout, Menu, Space, Tag, Tooltip, Typography, theme } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'
import { api, type Catalog } from './api'
import { navigate, useRoute, type Page } from './route'
import { ChangesView } from './views/ChangesView'
import { ComplianceView } from './views/ComplianceView'
import { DashboardView } from './views/DashboardView'
import { InvestigateView } from './views/InvestigateView'
import { MetricsView } from './views/MetricsView'

const PRIMARY = '#3a6ff7'

const NAV: { page: Page; label: string; icon: ReactNode; subtitle: string }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: <DashboardOutlined />, subtitle: 'Service health, key metrics, recent changes and active incidents' },
  { page: 'metrics', label: 'Core Metrics', icon: <LineChartOutlined />, subtitle: 'Metrics over time with change markers and alerts' },
  { page: 'changes', label: 'Changes', icon: <HistoryOutlined />, subtitle: 'Every change from every source, in one place' },
  { page: 'investigate', label: 'Investigate', icon: <AimOutlined />, subtitle: 'Rank the changes most likely behind an alert' },
  { page: 'guidelines', label: 'Change Guidelines', icon: <SafetyCertificateOutlined />, subtitle: 'How well each team documents its changes' },
]

function usePrefersDark() {
  const query = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return dark
}

export default function App() {
  const dark = usePrefersDark()
  const [catalog, setCatalog] = useState<Catalog>()

  useEffect(() => {
    api.catalog().then(setCatalog).catch(() => setCatalog(undefined))
  }, [])

  return (
    <ConfigProvider theme={{
      algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: { colorPrimary: PRIMARY, borderRadius: 6, fontSize: 14 },
      components: { Layout: { headerBg: '#111318', siderBg: dark ? '#141414' : '#ffffff' } },
    }}>
      <AntApp>
        <Shell catalog={catalog} />
      </AntApp>
    </ConfigProvider>
  )
}

function Shell({ catalog }: { catalog: Catalog | undefined }) {
  const { token } = theme.useToken()
  const route = useRoute()
  const screens = Grid.useBreakpoint()
  const current = NAV.find((n) => n.page === route.page)!
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const view = (() => {
    switch (route.page) {
      case 'dashboard': return <DashboardView catalog={catalog} />
      case 'metrics': return <MetricsView key={route.params.toString()} catalog={catalog} params={route.params} />
      case 'changes': return <ChangesView key={route.params.toString()} catalog={catalog} params={route.params} />
      case 'investigate': return <InvestigateView key={route.params.toString()} catalog={catalog} params={route.params} />
      case 'guidelines': return <ComplianceView />
    }
  })()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ height: 52, lineHeight: '52px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={26} height={26} alt="" />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: 0.2 }}>Change Radar</span>
        <span style={{ flex: 1 }} />
        <Space size={14} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
          {screens.sm && <span><ClockCircleOutlined /> {tz}</span>}
          {api.mode === 'demo' ? (
            <Tooltip title="Static build with a snapshot of demo data. Scoring runs in your browser.">
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>Static demo</Tag>
            </Tooltip>
          ) : (
            <Tag color="green" style={{ marginInlineEnd: 0 }}>Live API</Tag>
          )}
          <a href="https://github.com/clarkngo/change-radar" aria-label="Source on GitHub" style={{ color: '#fff', fontSize: 18 }}>
            <GithubOutlined />
          </a>
        </Space>
      </Layout.Header>
      <Layout>
        <Layout.Sider width={200} collapsedWidth={56} collapsed={!screens.xl} trigger={null}
          style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
          <Menu
            mode="inline"
            selectedKeys={[route.page]}
            onClick={({ key }) => navigate(key as Page)}
            style={{ borderInlineEnd: 'none', paddingTop: 8 }}
            items={NAV.map((n) => ({ key: n.page, icon: n.icon, label: n.label }))}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 16, background: token.colorBgLayout, minWidth: 0 }}>
          <div style={{ maxWidth: 1320, margin: '0 auto' }}>
            <div style={{ marginBottom: 12 }}>
              <Typography.Title level={4} style={{ margin: 0 }}>{current.label}</Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>{current.subtitle}</Typography.Text>
            </div>
            {view}
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
