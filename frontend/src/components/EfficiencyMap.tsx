import React, { useEffect, useState } from 'react'

interface MapPoint { flow_m3h: number; head: number; efficiency: number; is_design: boolean }
interface Props { flowRate: number; head: number; rpm: number }

export default function EfficiencyMap({ flowRate, head, rpm }: Props) {
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [hover, setHover] = useState<MapPoint | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!flowRate || !head || !rpm) return
    setLoading(true)
    fetch(`/api/v1/sizing/efficiency_map?flow_rate=${flowRate / 3600}&head=${head}&rpm=${rpm}`)
      .then(r => r.json())
      .then(d => setPoints(d.points || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [flowRate, head, rpm])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 13, gap: 8 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
      Calculando mapa η…
    </div>
  )
  if (points.length === 0) return null

  const W = 560, H = 340
  const pad = { top: 20, right: 24, bottom: 44, left: 52 }
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

  // Only show contour labels on every ~3rd Q × every ~3rd H to avoid overlap
  const qStep = Math.max(1, Math.floor(qVals.length / 5))
  const hStep = Math.max(1, Math.floor(hVals.length / 5))
  const labelPoints = points.filter(p => {
    const qi = qVals.indexOf(p.flow_m3h)
    const hi = hVals.indexOf(p.head)
    return qi % qStep === 0 && hi % hStep === 0
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 14, margin: 0, fontWeight: 700 }}>Mapa de Eficiência η</h3>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-primary)' }}>
          η max = {(etaMax * 100).toFixed(1)}%
        </span>
      </div>

      <div style={{ position: 'relative' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', cursor: 'crosshair' }}
          onMouseLeave={() => { setHover(null); setHoverPos(null) }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const mx = (e.clientX - rect.left) / rect.width * W
            const my = (e.clientY - rect.top) / rect.height * H
            // Find nearest cell
            let best: MapPoint | null = null, bestDist = Infinity
            points.forEach(p => {
              const dx = sx(p.flow_m3h) - mx, dy = sy(p.head) - my
              const dist = dx * dx + dy * dy
              if (dist < bestDist) { bestDist = dist; best = p }
            })
            if (best && bestDist < (cellW * cellW + cellH * cellH)) {
              setHover(best)
              setHoverPos({ x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
            } else {
              setHover(null); setHoverPos(null)
            }
          }}
        >
          {/* Colored cells */}
          {points.map((p, i) => (
            <rect key={i}
              x={sx(p.flow_m3h) - cellW / 2}
              y={sy(p.head) - cellH / 2}
              width={cellW + 1} height={cellH + 1}
              fill={etaToColor(p.efficiency)}
              opacity={hover && hover === p ? 1 : 0.88}
              stroke={hover && hover === p ? 'rgba(255,255,255,0.6)' : 'none'}
              strokeWidth={hover && hover === p ? 1.5 : 0}
            />
          ))}

          {/* Contour labels — sparse, only on grid intersections */}
          {labelPoints.map((p, i) => (
            <text key={i} x={sx(p.flow_m3h)} y={sy(p.head) + 3} textAnchor="middle"
              style={{ fill: 'rgba(0,0,0,0.75)', fontSize: 9, fontWeight: 700, pointerEvents: 'none' }}>
              {(p.efficiency * 100).toFixed(0)}
            </text>
          ))}

          {/* Axes */}
          <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="#555" strokeWidth={1} />
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={H - pad.bottom} stroke="#555" strokeWidth={1} />

          {/* Axis ticks */}
          {qVals.filter((_, i) => i % qStep === 0).map((q, i) => (
            <text key={i} x={sx(q)} y={H - pad.bottom + 14} textAnchor="middle" {...axisStyle}>{q.toFixed(0)}</text>
          ))}
          {hVals.filter((_, i) => i % hStep === 0).map((h, i) => (
            <text key={i} x={pad.left - 6} y={sy(h) + 4} textAnchor="end" {...axisStyle}>{h.toFixed(0)}</text>
          ))}
          <text x={W / 2} y={H - 4} textAnchor="middle" {...axisStyle}>Q [m³/h]</text>
          <text x={10} y={H / 2} textAnchor="middle" transform={`rotate(-90,10,${H / 2})`} {...axisStyle}>H [m]</text>

          {/* Design point — bright star with ring */}
          {designPt && (
            <g transform={`translate(${sx(designPt.flow_m3h)},${sy(designPt.head)})`}>
              <circle r={12} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
              <polygon points="0,-7 2,-2.5 7,-2.5 3,1 4.5,6.5 0,3.5 -4.5,6.5 -3,1 -7,-2.5 -2,-2.5" fill="#fff" />
            </g>
          )}
        </svg>

        {/* Hover tooltip */}
        {hover && hoverPos && (
          <div style={{
            position: 'absolute',
            left: `${Math.min(hoverPos.x + 2, 68)}%`,
            top: `${Math.max(hoverPos.y - 14, 2)}%`,
            background: 'rgba(10,10,10,0.92)', border: '1px solid var(--border-primary)',
            borderRadius: 6, padding: '7px 11px', fontSize: 12,
            color: 'var(--text-secondary)', pointerEvents: 'none',
            backdropFilter: 'blur(8px)', zIndex: 10, minWidth: 120,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Q = {hover.flow_m3h.toFixed(1)} m³/h
            </div>
            <div>H = <b style={{ color: 'var(--accent)' }}>{hover.head.toFixed(1)} m</b></div>
            <div>η = <b style={{ color: etaToColor(hover.efficiency) }}>{(hover.efficiency * 100).toFixed(1)}%</b></div>
            {hover.is_design && <div style={{ color: '#fff', marginTop: 4, fontSize: 11 }}>⭐ Ponto de projeto</div>}
          </div>
        )}
      </div>

      {/* Color scale legend + star info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(etaMin * 100).toFixed(0)}%</span>
          <div style={{ width: 100, height: 10, borderRadius: 5, background: 'linear-gradient(to right, rgb(33,150,243), rgb(76,175,80), rgb(255,152,0))' }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(etaMax * 100).toFixed(0)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', fontSize: 11, color: 'var(--text-muted)' }}>
          <svg width="10" height="10" viewBox="0 0 14 14">
            <polygon points="7,0 8.5,4.5 14,4.5 9.5,7.5 11,12 7,9 3,12 4.5,7.5 0,4.5 5.5,4.5" fill="#fff" />
          </svg>
          Ponto de projeto
        </div>
      </div>
    </div>
  )
}
