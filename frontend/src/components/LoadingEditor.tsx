import React, { useState } from 'react'

interface LoadingParams {
  nc: number
  nd: number
  slope: number
  drvt_le: number
  rvt_te: number
}

interface Props {
  onApply?: (hub: LoadingParams, shroud: LoadingParams, result: any) => void
}

export default function LoadingEditor({ onApply }: Props) {
  const [hub, setHub] = useState<LoadingParams>({ nc: 0.2, nd: 0.8, slope: 1.5, drvt_le: 0, rvt_te: 0.523 })
  const [shroud, setShroud] = useState<LoadingParams>({ nc: 0.2, nd: 0.8, slope: -1.41, drvt_le: 0, rvt_te: 0.523 })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const generateCurve = (p: LoadingParams): { x: number; y: number }[] => {
    const points = []
    for (let i = 0; i <= 50; i++) {
      const m = i / 50
      let val = 0
      if (m <= p.nc) {
        const t = p.nc > 0 ? m / p.nc : 0
        val = p.rvt_te * 0.5 * t * t * (3 - 2 * t)
      } else if (m <= p.nd) {
        const t = (p.nd - p.nc) > 0 ? (m - p.nc) / (p.nd - p.nc) : 1
        const plateau = p.rvt_te * (p.nc / (p.nc + (1 - p.nd))) * (1 + t * (p.nd - p.nc) / p.nd)
        val = Math.min(plateau, p.rvt_te * 0.95)
      } else {
        const t = (1 - p.nd) > 0 ? (m - p.nd) / (1 - p.nd) : 1
        const plateau = p.rvt_te * 0.85
        val = plateau + (p.rvt_te - plateau) * (3 * t * t - 2 * t * t * t)
      }
      points.push({ x: m, y: Math.max(0, Math.min(p.rvt_te * 1.1, val)) })
    }
    return points
  }

  const W = 560, H = 220
  const pad = { l: 40, r: 20, t: 20, b: 30 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const maxV = Math.max(hub.rvt_te, shroud.rvt_te) * 1.15

  const toSvg = (m: number, v: number) => ({
    x: pad.l + m * innerW,
    y: pad.t + (1 - v / maxV) * innerH,
  })

  const makePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => {
      const sv = toSvg(p.x, p.y)
      return `${i === 0 ? 'M' : 'L'} ${sv.x.toFixed(1)} ${sv.y.toFixed(1)}`
    }).join(' ')

  const hubCurve = generateCurve(hub)
  const shrCurve = generateCurve(shroud)
  const midCurve = hubCurve.map((p, i) => ({ x: p.x, y: (p.y + shrCurve[i].y) / 2 }))

  const handleApply = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/geometry/loading/distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hub, shroud, n_span: 3 }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult(data)
        onApply?.(hub, shroud, data)
      }
    } finally {
      setLoading(false)
    }
  }

  const sliderStyle: React.CSSProperties = { width: '100%', accentColor: 'var(--accent)' }

  const ParamSliders = ({
    params,
    setParams,
    color,
    label,
  }: {
    params: LoadingParams
    setParams: React.Dispatch<React.SetStateAction<LoadingParams>>
    color: string
    label: string
  }) => (
    <div>
      <h4 style={{ color, margin: '0 0 8px', fontSize: 13 }}>{label}</h4>
      {(['nc', 'nd', 'slope', 'rvt_te'] as (keyof LoadingParams)[]).map(key => (
        <label key={key} style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          {key.toUpperCase()}: {params[key].toFixed(3)}
          <input
            type="range"
            style={sliderStyle}
            min={key === 'slope' ? -3 : key === 'rvt_te' ? 0.1 : 0}
            max={key === 'slope' ? 3 : key === 'rvt_te' ? 2 : 1}
            step={0.01}
            value={params[key]}
            onChange={e => setParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
          />
        </label>
      ))}
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 20, border: '1px solid var(--border-primary)' }}>
      <h3 style={{ color: 'var(--accent)', margin: '0 0 16px', fontSize: 15 }}>Editor de Carregamento de Pá (rVθ*)</h3>

      <svg width={W} height={H} style={{ background: 'var(--bg-primary)', borderRadius: 6, display: 'block' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <line
            key={v}
            x1={pad.l + v * innerW} y1={pad.t}
            x2={pad.l + v * innerW} y2={pad.t + innerH}
            stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5}
          />
        ))}
        {[0.25, 0.5, 0.75, 1].map(v => (
          <line
            key={v}
            x1={pad.l} y1={pad.t + (1 - v) * innerH}
            x2={pad.l + innerW} y2={pad.t + (1 - v) * innerH}
            stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5}
          />
        ))}
        {/* Axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="var(--text-muted)" strokeWidth={1} />
        <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="var(--text-muted)" strokeWidth={1} />
        {/* Curves */}
        <path d={makePath(hubCurve)} stroke="#4fc3f7" strokeWidth={2} fill="none" />
        <path d={makePath(midCurve)} stroke="#a5d6a7" strokeWidth={1.5} fill="none" strokeDasharray="5,3" />
        <path d={makePath(shrCurve)} stroke="#ef9a9a" strokeWidth={2} fill="none" />
        {/* NC/ND markers */}
        {[
          { v: hub.nc, label: 'NC', color: '#ffb300' },
          { v: hub.nd, label: 'ND', color: '#ce93d8' },
        ].map(mk => (
          <g key={mk.label}>
            <line
              x1={pad.l + mk.v * innerW} y1={pad.t}
              x2={pad.l + mk.v * innerW} y2={pad.t + innerH}
              stroke={mk.color} strokeWidth={1} strokeDasharray="4,2"
            />
            <text x={pad.l + mk.v * innerW + 3} y={pad.t + 12} fill={mk.color} fontSize={10}>{mk.label}</text>
          </g>
        ))}
        {/* Axis labels */}
        <text x={pad.l} y={H - 5} fill="var(--text-muted)" fontSize={10}>0</text>
        <text x={pad.l + innerW - 10} y={H - 5} fill="var(--text-muted)" fontSize={10}>1 (TE)</text>
        <text
          x={12} y={pad.t + innerH / 2}
          fill="var(--text-muted)" fontSize={9}
          transform={`rotate(-90, 12, ${pad.t + innerH / 2})`}
          textAnchor="middle"
        >
          rVθ* [m²/s]
        </text>
        {/* Legend */}
        <text x={W - pad.r - 60} y={pad.t + 14} fill="#4fc3f7" fontSize={9}>— Hub</text>
        <text x={W - pad.r - 60} y={pad.t + 26} fill="#a5d6a7" fontSize={9}>- - Mid</text>
        <text x={W - pad.r - 60} y={pad.t + 38} fill="#ef9a9a" fontSize={9}>— Shroud</text>
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <ParamSliders params={hub} setParams={setHub} color="#4fc3f7" label="Hub" />
        <ParamSliders params={shroud} setParams={setShroud} color="#ef9a9a" label="Shroud" />
      </div>

      <button
        onClick={handleApply}
        disabled={loading}
        style={{
          marginTop: 12, padding: '8px 20px',
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13, opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Aplicando...' : 'Aplicar ao Projeto'}
      </button>

      {result && (
        <div style={{
          marginTop: 12, padding: 8,
          background: 'var(--bg-surface)', borderRadius: 4,
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          Carregamento calculado: hub={result.hub ? 'OK' : '—'} mid={result.mid ? 'OK' : '—'} shroud={result.shroud ? 'OK' : '—'}
        </div>
      )}
    </div>
  )
}
