// Renders the repository's docs/*.md in the app, so there's one copy of the documentation. Loaded lazily:
// the markdown text, the renderer and Mermaid only download when someone opens this page.
import { Card, Col, Menu, Row, Select, Typography, theme } from 'antd'
import { useEffect, useId, useState, type ComponentProps } from 'react'
import Markdown from 'react-markdown'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { navigate } from '../route'

const REPO = 'https://github.com/clarkngo/change-radar/blob/main'

/** Pages in reading order. The slug is the file name in docs/ without .md. */
const PAGES: { slug: string; title: string }[] = [
  { slug: 'README', title: 'Start here' },
  { slug: 'overview', title: 'Overview' },
  { slug: 'user-guide', title: 'Using the app' },
  { slug: 'architecture', title: 'Architecture' },
  { slug: 'process-flows', title: 'Process flows' },
  { slug: 'scoring', title: 'Suspect scoring' },
  { slug: 'data-sources', title: 'Change sources' },
  { slug: 'api', title: 'API reference' },
  { slug: 'demo-data', title: 'Demo data' },
  { slug: 'tech-stack', title: 'Tech stack' },
  { slug: 'development', title: 'Development' },
]

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const TEXT: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../../docs/*.md', { query: '?raw', import: 'default', eager: true }))
    .map(([path, text]) => [fileName(path).replace(/\.md$/, ''), text]),
)
const IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../../docs/*.{jpg,png,svg}', { query: '?url', import: 'default', eager: true }))
    .map(([path, url]) => [fileName(path), url]),
)

/** Resolves a link in a doc: other docs open in the app, other repo files on GitHub, everything else as is. */
function resolve(href: string, current: string): { doc?: string; section?: string; url?: string } {
  if (/^[a-z]+:/i.test(href)) return { url: href }
  const [path, section] = href.split('#')
  if (!path) return { doc: current, section }
  const parts = ['docs']
  for (const p of path.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.') parts.push(p)
  }
  const resolved = parts.join('/')
  const doc = resolved.match(/^docs\/([\w-]+)\.md$/)?.[1]
  if (doc && TEXT[doc]) return { doc, section }
  return { url: `${REPO}/${resolved}${section ? `#${section}` : ''}` }
}

export default function DocsView({ params }: { params: URLSearchParams }) {
  const { token } = theme.useToken()
  const doc = TEXT[params.get('doc') ?? ''] ? params.get('doc')! : 'README'
  const section = params.get('section') ?? undefined

  useEffect(() => {
    const scroll = () => {
      const target = section ? document.getElementById(section) : undefined
      if (target) target.scrollIntoView({ block: 'start' })
      else window.scrollTo({ top: 0 })
    }
    scroll()
    if (!section) return
    // Images above the section load after the first scroll and push it down, so scroll again as each one loads.
    const pending = [...document.querySelectorAll<HTMLImageElement>('.docs-md img')].filter((img) => !img.complete)
    for (const img of pending) img.addEventListener('load', scroll, { once: true })
    return () => pending.forEach((img) => img.removeEventListener('load', scroll))
  }, [doc, section])

  const open = (slug: string, s?: string) => navigate('docs', { doc: slug, section: s })

  const link = ({ href = '', children, ...rest }: ComponentProps<'a'>) => {
    const target = resolve(href, doc)
    if (target.url) return <a {...rest} href={target.url} target="_blank" rel="noreferrer">{children}</a>
    const query = new URLSearchParams(Object.entries(target).filter((e): e is [string, string] => !!e[1]))
    return (
      <a {...rest} href={`#/docs?${query}`}
        onClick={(e) => { e.preventDefault(); open(target.doc!, target.section) }}>
        {children}
      </a>
    )
  }

  return (
    <Row gutter={[16, 12]}>
      <Col xs={24} lg={6} xl={5}>
        <div className="docs-picker">
          <Select value={doc} onChange={(slug) => open(slug)} style={{ width: '100%' }}
            options={PAGES.map((p) => ({ value: p.slug, label: p.title }))} />
        </div>
        <Card size="small" className="docs-nav" styles={{ body: { padding: 4 } }}>
          <Menu mode="inline" selectedKeys={[doc]} onClick={({ key }) => open(key)}
            style={{ borderInlineEnd: 'none', background: 'transparent' }}
            items={PAGES.map((p) => ({ key: p.slug, label: p.title }))} />
        </Card>
      </Col>
      <Col xs={24} lg={18} xl={19}>
        <Card>
          <div className="docs-md" style={{
            ['--docs-border' as string]: token.colorBorderSecondary,
            ['--docs-code-bg' as string]: token.colorFillTertiary,
            ['--docs-muted' as string]: token.colorTextSecondary,
            ['--docs-head-bg' as string]: token.colorFillQuaternary,
            ['--docs-link' as string]: token.colorPrimary,
          }}>
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}
              components={{
                a: link,
                img: ({ src = '', alt }) => <img src={IMAGES[fileName(String(src))] ?? String(src)} alt={alt} />,
                table: ({ children }) => <div className="docs-table"><table>{children}</table></div>,
                code: ({ className, children, ...rest }) => className === 'language-mermaid'
                  ? <Mermaid code={String(children)} />
                  : <code className={className} {...rest}>{children}</code>,
                pre: ({ children }) => {
                  const child = Array.isArray(children) ? children[0] : children
                  return (child as { props?: { className?: string } })?.props?.className === 'language-mermaid'
                    ? <>{children}</> : <pre>{children}</pre>
                },
              }}>
              {TEXT[doc]}
            </Markdown>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Also on GitHub: <a href={`${REPO}/docs/${doc}.md`} target="_blank" rel="noreferrer">docs/{doc}.md</a>
          </Typography.Text>
        </Card>
      </Col>
    </Row>
  )
}

let mermaidReady: Promise<typeof import('mermaid')['default']> | undefined
// Mermaid keeps global state while rendering, so diagrams render one at a time.
let queue: Promise<unknown> = Promise.resolve()

/** Renders a Mermaid diagram, matching the light or dark theme. Mermaid itself is loaded on first use. */
function Mermaid({ code }: { code: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const [svg, setSvg] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    mermaidReady ??= import('mermaid').then((m) => m.default)
    const job = queue.then(() => mermaidReady!).then(async (mermaid) => {
      mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' })
      return (await mermaid.render(id, code)).svg
    })
    queue = job.catch(() => undefined)
    job.then((result) => !cancelled && setSvg(result)).catch((e) => !cancelled && setError(String(e)))
    return () => { cancelled = true }
  }, [code, dark, id])

  if (error) return <pre>{code}</pre>
  return svg
    ? <div className="docs-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
    : <div className="docs-mermaid" style={{ minHeight: 120 }}>Drawing diagram…</div>
}
