import React, { useState, useEffect, useCallback } from 'react'

interface EdgePoint2D {
  x: number
  y: number
}

interface LETEResponse {
  le_thickness_mm: number
  te_thickness_mm: number
  le_radius_mm: number
  te_radius_mm: number
  le_type: string
  te_type: string
  before_le_profile: EdgePoint2D[]
  after_le_profile: EdgePoint2D[]
  before_te_profile: EdgePoint2D[]
  after_te_profile: EdgePoint2D[]
}

interface LETEDefaults {
  nq: number
  nq_range: string
  le_radius_mm: number
  le_type: string
  te_radius_mm: number
  te_type: string
}

interface Props {
  flowRate: number   // m3/h (will be converted to m3/s)
  head: number
  rpm: number
  nq?: number
}

const LE_TYPES = ['elliptic', 'circular', 'sharp'] as const
const TE_TYPES = ['blunt', 'tapered', 'circular'] as const

function EdgeProfileSVG({
  beforeProfile,
  afterProfile,
  label,
  width = 140,
  height = 80,
}: {
  beforeProfile: EdgePoint2D[]
  afterProfile: EdgePoint2D[]
  label: string
  width?: number
  height?: number
}) {
  // Compute bounds from both profiles for consistent scaling
  const allPts = [...beforeProfile, ...afterProfile]
  if (allPts.length === 0) return null

  const xs = allPts.map(p => p.x)
  const ys = allPts.map(p => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xRange = Math.max(xMax - xMin, 0.01)
  const yRange = Math.max(yMax - yMin, 0.01)

  const pad = 10
  const drawW = width - 2 * pad
  const drawH = height - 2 * pad - 14  // space for label

  const toSvg = (p: EdgePoint2D) => ({
    x: pad + ((p.x - xMin) / xRange) * drawW,
    y: pad + 14 + drawH - ((p.y - yMin) / yRange) * drawH,
  })

  const pathD = (pts: EdgePoint2D[]) =>
    pts.map((p, i) => {
      const s = toSvg(p)
      return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`
    }).join(' ')

  return (
    <svg width={width} height={height} style={{ background: 'var(--bg-surface)', borderRadius: 4, border: '1px solid var(--border-primary)' }}>
      <text x={width / 2} y={12} textAnchor="middle" fill="var(--text-muted)" fontSize={9}>{label}</text>
      {beforeProfile.length > 0 && (
        <path d={pathD(beforeProfile)} fill="none" stroke="rgba(255,100,100,0.5)" strokeWidth={1.5} strokeDasharray="3,3" />
      )}
      {afterProfile.length > 0 && (
        <path d={pathD(afterProfile)} fill="none" stroke="var(--accent)" strokeWidth={2} />
      )}
    </svg>
  )
}

export default function LETEEditor({ flowRate, head, rpm, nq }: Props) {
  const [leRadius, setLeRadius] = useState(2.0)
  const [teRadius, setTeRadius] = useState(0.8)
  const [leType, setLeType] = useState<string>('elliptic')
  const [teType, setTeType] = useState<string>('blunt')
  const [result, setResult] = useState<LETEResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load defaults based on Nq
  useEffect(() => {
    if (!nq || nq <= 0) return
    fetch(`/api/v1/blade/lete/defaults?nq=${nq}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d: LETEDefaults) => {
        setLeRadius(d.le_radius_mm)
        setTeRadius(d.te_radius_mm)
        setLeType(d.le_type)
        setTeType(d.te_type)
      })
      .catch(() => { /* keep current values */ })
  }, [nq])

  const handleApply = useCallback(async () => {
    if (flowRate <= 0 || head <= 0 || rpm <= 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/blade/lete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          le_radius_mm: leRadius,
          te_radius_mm: teRadius,
          le_type: leType,
          te_type: teType,
          flow_rate: flowRate / 3600,
          head,
          rpm,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || `Erro ${res.status}`)
      }
      setResult(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [flowRate, head, rpm, leRadius, teRadius, leType, teType])

  const panelStyle: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    padding: 16,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-muted)',
    display: 'block',
    marginBottom: 3,
  }

  const sliderRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  }

  return (
    <div style={panelStyle}>
      <h4 style={{ color: 'var(--accent)', fontSize: 13, margin: '0 0 12px 0' }}>
        Refinamento LE / TE
      </h4>

      {/* Leading Edge */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ ...labelStyle, fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' }}>
          Leading Edge (LE)
        </span>
        <div style={sliderRow}>
          <span style={labelStyle}>Raio</span>
          <input
            type="range"
            min={0.5} max={5} step={0.1}
            value={leRadius}
            onChange={e => setLeRadius(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-primary)', minWidth: 48, textAlign: 'right' }}>
            {leRadius.toFixed(1)} mm
          </span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <span style={labelStyle}>Tipo</span>
          <select
            value={leType}
            onChange={e => setLeType(e.target.value)}
            className="input"
            style={{ padding: '4px 8px', fontSize: 11, width: '100%' }}
          >
            {LE_TYPES.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trailing Edge */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ ...labelStyle, fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' }}>
          Trailing Edge (TE)
        </span>
        <div style={sliderRow}>
          <span style={labelStyle}>Raio</span>
          <input
            type="range"
            min={0.2} max={3} step={0.1}
            value={teRadius}
            onChange={e => setTeRadius(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-primary)', minWidth: 48, textAlign: 'right' }}>
            {teRadius.toFixed(1)} mm
          </span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <span style={labelStyle}>Tipo</span>
          <select
            value={teType}
            onChange={e => setTeType(e.target.value)}
            className="input"
            style={{ padding: '4px 8px', fontSize: 11, width: '100%' }}
          >
            {TE_TYPES.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Apply button */}
      <button
        className="btn-primary"
        onClick={handleApply}
        disabled={loading || flowRate <= 0 || head <= 0 || rpm <= 0}
        style={{ width: '100%', padding: '8px', fontSize: 12, marginBottom: 10 }}
      >
        {loading ? 'Aplicando...' : 'Aplicar'}
      </button>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--accent-danger)', marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Before/after SVG preview */}
      {result && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,100,100,0.7)' }}>---</span> Antes &nbsp;
            <span style={{ color: 'var(--accent)' }}>---</span> Depois
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <EdgeProfileSVG
              beforeProfile={result.before_le_profile}
              afterProfile={result.after_le_profile}
              label="Leading Edge"
            />
            <EdgeProfileSVG
              beforeProfile={result.before_te_profile}
              afterProfile={result.after_te_profile}
              label="Trailing Edge"
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
            LE: {result.le_radius_mm.toFixed(2)} mm ({result.le_type}) &middot;
            TE: {result.te_radius_mm.toFixed(2)} mm ({result.te_type})
          </div>
        </div>
      )}
    </div>
  )
}
