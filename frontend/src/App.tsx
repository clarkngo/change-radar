import { GithubOutlined } from '@ant-design/icons'
import { App as AntApp, ConfigProvider, Layout, Space, Tabs, Tag, Tooltip, Typography, theme } from 'antd'
import { useEffect, useState } from 'react'
import { api, type Catalog } from './api'
import { ChangesView } from './views/ChangesView'
import { ComplianceView } from './views/ComplianceView'
import { InvestigateView } from './views/InvestigateView'

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
      token: { colorPrimary: '#0f766e', borderRadius: 8 },
    }}>
      <AntApp>
        <Shell catalog={catalog} />
      </AntApp>
    </ConfigProvider>
  )
}

function Shell({ catalog }: { catalog: Catalog | undefined }) {
  const { token } = theme.useToken()
  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Layout.Header style={{
        background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`,
        padding: '0 16px', height: 'auto', lineHeight: 1.4,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={30} height={30} alt="" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>Change Radar</Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Something broke. What changed right before it?
            </Typography.Text>
          </div>
          <Space>
            {api.mode === 'demo' ? (
              <Tooltip title="Static build with a snapshot of demo data. Scoring runs in your browser.">
                <Tag color="orange">Static demo</Tag>
              </Tooltip>
            ) : (
              <Tag color="green">Live API</Tag>
            )}
            <a href="https://github.com/clarkngo/change-radar" aria-label="Source on GitHub" style={{ color: token.colorText, fontSize: 20 }}>
              <GithubOutlined />
            </a>
          </Space>
        </div>
      </Layout.Header>
      <Layout.Content style={{ padding: '16px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Tabs
            defaultActiveKey="investigate"
            items={[
              { key: 'investigate', label: 'Investigate', children: <InvestigateView catalog={catalog} /> },
              { key: 'changes', label: 'All changes', children: <ChangesView catalog={catalog} /> },
              { key: 'compliance', label: 'Guidelines', children: <ComplianceView /> },
            ]}
          />
        </div>
      </Layout.Content>
    </Layout>
  )
}
