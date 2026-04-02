import React, { useEffect, useState } from 'react'

interface MapPoint { flow_m3h: number; head: number; efficiency: number; is_design: boolean }
interface Props { flowRate: number; head: number; rpm: number }

export default function EfficiencyMap({ flowRate, head, rpm }: Props) {
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!flowRate || !head || !rpm) return
    setLoading(true)
    fetch(`/api/v1/sizing/efficiency_map?flow_rate=${flowRate / 3600}&head=${head}&rpm=${rpm}`)
      .then(r => r.json())
      .then(d => setPoints(d.points || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [flowRate, head, rpm])

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Calculando mapa de eficiência...</p>
  if (points.length === 0) return null

  const W = 560, H = 340
  const pad = { top: 20, right: 24, bottom: 44, left: 60 }
  const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom

  const qVals = [...new Set(points.map(p => p.flow_m3h))].sort((a, b) => a - b)
  const hVals = [...new Set(points.map(p => p.head))].sort((a, b) => a - b)
  const qMin = qVals[0], qMax = qVals[qVals.length - 1]
  const hMin = hVals[0], hMax = hVals[hVals.length - 1]
  const etaMin = Math.min(...points.map(p => p.efficiency))
  const etaMax = Math.max(...points.map(p => p.efficiency))

  const sx = (q: number) => pad.left + (q - qMin) / (qMax - qMin) * cW
  const sy = (h: number) => pad.top + cH - (h - hMin) / (hMax - hMin) * cH

  const cellW = cW / (qVals.length - 1)
  const cellH = cH / (hVals.length - 1)

  // Color scale: blue (low) → green (BEP) → orange (high)
  const etaToColor = (eta: number): string => {
    const t = (eta - etaMin) / (etaMax - etaMin || 1)
    if (t < 0.5) {
      const r = Math.round(33 + (76 - 33) * t * 2)
      const g = Math.round(150 + (175 - 150) * t * 2)
      const b = Math.round(243 + (80 - 243) * t * 2)
      return `rgb(${r},${g},${b})`
    } else {
      const t2 = (t - 0.5) * 2
      const r = Math.round(76 + (255 - 76) * t2)
      const g = Math.round(175 + (152 - 175) * t2)
      const b = Math.round(80 + (0 - 80) * t2)
      return `rgb(${r},${g},${b})`
    }
  }

  const designPt = points.find(p => p.is_design)
  const axisStyle = { fill: '#6b7280', fontSize: 10 }

  return (
    <div>
      <h3 style={{ color: 'var(--accent)', fontSize: 15, marginBottom: 8 }}>Mapa de Eficiência (η-map)</h3>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Colored cells */}
        {points.map((p, i) => (
          <rect key={i}
            x={sx(p.flow_m3h) - cellW / 2}
            y={sy(p.head) - cellH / 2}
            width={cellW + 1} height={cellH + 1}
            fill={etaToColor(p.efficiency)}
            opacity={0.85}
          />
        ))}

        {/* Efficiency contour labels */}
        {points.filter((_, i) => i % 4 === 0).map((p, i) => (
          <text key={i} x={sx(p.flow_m3h)} y={sy(p.head) + 4} textAnchor="middle"
            style={{ fill: 'rgba(0,0,0,0.7)', fontSize: 8, fontWeight: 600 }}>
            {(p.efficiency * 100).toFixed(0)}
          </text>
        ))}

        {/* Axes */}
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="#555" strokeWidth={1} />
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={H - pad.bottom} stroke="#555" strokeWidth={1} />

        {/* Axis ticks */}
        {qVals.filter((_, i) => i % Math.ceil(qVals.length / 5) === 0).map((q, i) => (
          <text key={i} x={sx(q)} y={H - pad.bottom + 14} textAnchor="middle" {...axisStyle}>{q.toFixed(0)}</text>
        ))}
        {hVals.filter((_, i) => i % Math.ceil(hVals.length / 5) === 0).map((h, i) => (
          <text key={i} x={pad.left - 6} y={sy(h) + 4} textAnchor="end" {...axisStyle}>{h.toFixed(0)}</text>
        ))}
        <text x={W / 2} y={H - 4} textAnchor="middle" {...axisStyle}>Q [m³/h]</text>
        <text x={12} y={H / 2} textAnchor="middle" transform={`rotate(-90,12,${H / 2})`} {...axisStyle}>H [m]</text>

        {/* Design point star */}
        {designPt && (
          <g transform={`translate(${sx(designPt.flow_m3h)},${sy(designPt.head)})`}>
            <polygon points="0,-8 2,-3 7,-3 3,1 5,7 0,4 -5,7 -3,1 -7,-3 -2,-3" fill="#fff" opacity={0.9} />
          </g>
        )}
      </svg>

      {/* Color scale legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>η baixo</span>
        <div style={{ width: 120, height: 8, borderRadius: 4, background: 'linear-gradient(to right, rgb(33,150,243), rgb(76,175,80), rgb(255,152,0))' }} />
        <span>η alto ({(etaMax * 100).toFixed(1)}%)</span>
        <span style={{ marginLeft: 8 }}>⭐ = Ponto de projeto</span>
      </div>
    </div>
  )
}
