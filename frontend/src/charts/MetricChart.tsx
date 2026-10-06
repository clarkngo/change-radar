import { Tag, Typography, theme } from 'antd'
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { ChangeEvent } from '../api'
import { TYPE_COLOR_HEX, TYPE_LABEL, formatTime } from '../format'
import type { Point } from '../metrics'

export interface Series {
  name: string
  color: string
  dashed?: boolean
  points: Point[]
}

export interface AlertMark {
  t: number
  label: string
}

interface Props {
  series: Series[]
  changes?: ChangeEvent[]
  alerts?: AlertMark[]
  from: number
  to: number
  height?: number
  format: (v: number) => string
  onChangeClick?: (change: ChangeEvent) => void
  onAlertClick?: (t: number) => void
}

const PAD = { top: 28, right: 16, bottom: 28, left: 56 }

/**
 * Time-series chart with change markers along the top. Hovering the plot shows the values at that time;
 * hovering a marker shows the change that took effect then. This is the core "what changed?" interaction.
 */
export function MetricChart({ series, changes = [], alerts = [], from, to, height = 320, format, onChangeClick, onAlertClick }: Props) {
  const { token } = theme.useToken()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hoverT, setHoverT] = useState<number>()
  const [hoverChange, setHoverChange] = useState<ChangeEvent>()

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const innerW = Math.max(100, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const all = series.flatMap((s) => s.points.map((p) => p.v))
  const yTicks = niceTicks(0, all.length ? Math.max(...all) * 1.05 : 1)
  const min = 0
  const max = yTicks[yTicks.length - 1]
  const x = (t: number) => PAD.left + ((t - from) / (to - from)) * innerW
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH

  const ticks = useMemo(() => {
    const span = to - from
    const maxTicks = Math.max(2, Math.floor(innerW / (span > 86_400_000 ? 105 : 60)))
    const step = [5, 15, 30, 60, 180, 360, 720, 1440, 2880].map((m) => m * 60_000).find((s) => span / s <= maxTicks) ?? 86_400_000
    const out: number[] = []
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push(t)
    return out
  }, [from, to, innerW])

  const tickLabel = (t: number) => {
    const d = new Date(t)
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return to - from > 86_400_000 ? `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hm}` : hm
  }

  const visibleChanges = changes.filter((c) => {
    const t = Date.parse(c.startedAt)
    return t >= from && t <= to
  })

  function onMove(e: MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const t = from + ((e.clientX - rect.left) / rect.width) * (to - from)
    setHoverT(t)
  }

  const nearest = (s: Series) => {
    if (hoverT === undefined || s.points.length === 0) return undefined
    return s.points.reduce((best, p) => (Math.abs(p.t - hoverT) < Math.abs(best.t - hoverT) ? p : best))
  }

  const tooltipLeft = (px: number) => Math.min(Math.max(px + 12, 0), width - 260)

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%', minWidth: 0 }} onMouseLeave={() => { setHoverT(undefined); setHoverChange(undefined) }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}
        role="img" aria-label="Metric chart with change markers">
        {yTicks.map((v) => {
          return (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={token.colorBorderSecondary} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={token.colorTextTertiary}>{format(v)}</text>
            </g>
          )
        })}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={height - 8} textAnchor="middle" fontSize={11} fill={token.colorTextTertiary}>{tickLabel(t)}</text>
        ))}

        {alerts.filter((a) => a.t >= from && a.t <= to).map((a) => (
          <g key={a.t}>
            <rect x={x(a.t) - 1} y={PAD.top} width={2} height={innerH} fill={token.colorError} opacity={0.5} />
          </g>
        ))}

        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2}
            strokeDasharray={s.dashed ? '4 4' : undefined} opacity={s.dashed ? 0.7 : 1}
            points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} />
        ))}

        {visibleChanges.map((c) => {
          const cx = x(Date.parse(c.startedAt))
          const color = TYPE_COLOR_HEX[c.type]
          const active = hoverChange?.id === c.id
          return (
            <line key={`l-${c.id}`} x1={cx} x2={cx} y1={PAD.top - 6} y2={PAD.top + innerH} stroke={color}
              strokeDasharray="3 3" opacity={active ? 0.9 : 0.35} />
          )
        })}

        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} />

        {alerts.filter((a) => a.t >= from && a.t <= to).map((a) => (
          <circle key={`a-${a.t}`} cx={x(a.t)} cy={PAD.top + innerH} r={6} fill={token.colorError}
            stroke={token.colorBgContainer} strokeWidth={2} style={{ cursor: onAlertClick ? 'pointer' : 'default' }}
            onClick={() => onAlertClick?.(a.t)}>
            <title>{`${a.label}${onAlertClick ? ' (click to investigate)' : ''}`}</title>
          </circle>
        ))}

        {hoverT !== undefined && !hoverChange && (
          <line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={PAD.top + innerH} stroke={token.colorTextQuaternary} pointerEvents="none" />
        )}

        {visibleChanges.map((c) => {
          const cx = x(Date.parse(c.startedAt))
          const color = TYPE_COLOR_HEX[c.type]
          return (
            <g key={`m-${c.id}`} style={{ cursor: onChangeClick ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoverChange(c)} onMouseLeave={() => setHoverChange(undefined)}
              onClick={() => onChangeClick?.(c)}>
              <rect x={cx - 7} y={PAD.top - 20} width={14} height={14} rx={3} fill={color} />
              <text x={cx} y={PAD.top - 9.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" pointerEvents="none">
                {TYPE_LABEL[c.type][0]}
              </text>
            </g>
          )
        })}
      </svg>

      {hoverChange && (
        <div style={{ ...tooltipStyle(token), left: tooltipLeft(x(Date.parse(hoverChange.startedAt))), top: PAD.top }}>
          <Tag color={TYPE_COLOR_HEX[hoverChange.type]} style={{ marginBottom: 6 }}>{TYPE_LABEL[hoverChange.type]}</Tag>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{hoverChange.summary}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {hoverChange.service} · {formatTime(hoverChange.startedAt)} · {hoverChange.author || 'unknown'}
            {hoverChange.ticket ? ` · ${hoverChange.ticket}` : ' · no ticket'}
          </Typography.Text>
          {onChangeClick && <div style={{ fontSize: 12, marginTop: 6, color: token.colorPrimary }}>Click to open in Changes</div>}
        </div>
      )}

      {hoverT !== undefined && !hoverChange && (
        <div style={{ ...tooltipStyle(token), left: tooltipLeft(x(hoverT)), top: PAD.top + 8, pointerEvents: 'none' }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>{formatTime(new Date(hoverT).toISOString())}</div>
          {series.map((s) => {
            const p = nearest(s)
            return p && (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />
                <span style={{ flex: 1 }}>{s.name}</span>
                <strong>{format(p.v)}</strong>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function tooltipStyle(token: ReturnType<typeof theme.useToken>['token']) {
  return {
    position: 'absolute' as const,
    width: 250,
    padding: '10px 12px',
    background: token.colorBgElevated,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: token.borderRadius,
    boxShadow: token.boxShadowSecondary,
    zIndex: 2,
  }
}

/** Round axis ticks (1, 2, 2.5 or 5 × 10^n) so labels read like 0, 500, 1k, 1.5k. */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / (count - 1) || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  const ticks: number[] = []
  for (let v = Math.floor(lo / step) * step; v < hi + step; v += step) ticks.push(v)
  return ticks
}
