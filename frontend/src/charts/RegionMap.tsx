import { theme } from 'antd'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { formatChange } from '../format'
import { REGIONS, badness, type MetricDef, type Region } from '../metrics'

export interface RegionValue {
  value: number
  /** Week-over-week change, as a fraction. */
  change: number
}

interface Props {
  values: Map<string, RegionValue>
  metric: MetricDef
  selected?: string
  onSelect?: (region: Region) => void
}

/** Change in the bad direction at which a region reaches full color. */
const SATURATE_AT = 0.25

const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
const countries = feature(topology, topology.objects.countries).features.filter((f) => f.id !== '010') // no Antarctica
const regionOfCountry = new Map(REGIONS.flatMap((r) => r.countries.map((c) => [c, r] as const)))

/**
 * World choropleth of week-over-week change per region. Diverging scale: red where the metric moved the bad way,
 * blue where it improved, neutral gray when flat. Countries outside a tracked region stay blank.
 */
export function RegionMap({ values, metric, selected, onSelect }: Props) {
  const { token } = theme.useToken()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<{ region: Region; x: number; y: number }>()

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = Math.round(width * 0.48)
  const path = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([width, height], { type: 'FeatureCollection', features: countries })
    return geoPath(projection)
  }, [width, height])

  const fill = (region: Region | undefined) => {
    if (!region) return token.colorFillTertiary
    const v = values.get(region.id)
    if (!v) return token.colorFillSecondary
    const b = Math.max(-1, Math.min(1, badness(v.change, metric) / SATURATE_AT))
    return mix(token.colorBgContainer, NEUTRAL, b < 0 ? GOOD : BAD, Math.abs(b))
  }

  const hovered = hover && values.get(hover.region.id)

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setHover(undefined)}>
      <svg width={width} height={height} role="img" aria-label={`World map of ${metric.label} change by region`}
        style={{ display: 'block' }}>
        {countries.map((c, i) => {
          const region = c.id === undefined ? undefined : regionOfCountry.get(String(c.id))
          const active = !!region && (region.id === selected || region.id === hover?.region.id)
          return (
            <path key={c.id ?? `n${i}`} d={path(c) ?? undefined} fill={fill(region)}
              stroke={active ? token.colorText : token.colorBgContainer} strokeWidth={active ? 1.2 : 0.5}
              style={{ cursor: region && onSelect ? 'pointer' : 'default' }}
              onMouseMove={(e) => {
                if (!region) return setHover(undefined)
                const box = wrap.current!.getBoundingClientRect()
                setHover({ region, x: e.clientX - box.left, y: e.clientY - box.top })
              }}
              onClick={() => region && onSelect?.(region)} />
          )
        })}
      </svg>

      {hover && hovered && (
        <div style={{
          position: 'absolute', left: Math.min(hover.x + 14, width - 220), top: Math.max(hover.y - 70, 0), width: 210,
          padding: '8px 10px', background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadius, boxShadow: token.boxShadowSecondary, pointerEvents: 'none', zIndex: 2,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{hover.region.label}</div>
          <div style={{ fontSize: 13 }}>{metric.label}: <strong>{metric.format(hovered.value)}</strong></div>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
            {formatChange(hovered.change)} vs last week{onSelect ? ' · click to chart' : ''}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: token.colorTextSecondary, marginTop: 6 }}>
        <span>Better</span>
        <span style={{
          width: 160, height: 8, borderRadius: 4,
          background: `linear-gradient(to right, ${mix(token.colorBgContainer, NEUTRAL, GOOD, 1)}, ${mix(token.colorBgContainer, NEUTRAL, GOOD, 0)}, ${mix(token.colorBgContainer, NEUTRAL, BAD, 1)})`,
        }} />
        <span>Worse</span>
        <span style={{ marginLeft: 4 }}>vs last week (full color at ±{SATURATE_AT * 100}%)</span>
      </div>
    </div>
  )
}

const NEUTRAL = '#8c8c8c'
const BAD = '#e5484d'
const GOOD = '#3a6ff7'

/** Blends from the neutral gray toward `to` by t, drawn over the surface so it holds up in light and dark. */
function mix(surface: string, from: string, to: string, t: number): string {
  const [a, b, s] = [from, to, surface].map(rgb)
  const c = a.map((v, i) => v + (b[i] - v) * t)
  // Neutral sits at 35% over the surface, full color at 100%.
  const alpha = 0.35 + 0.65 * t
  return `rgb(${c.map((v, i) => Math.round(s[i] + (v - s[i]) * alpha)).join(',')})`
}

function rgb(hex: string): number[] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
