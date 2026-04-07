import React, { useState, useCallback } from 'react'
import t from '../i18n'

interface CurvePoint { flow_rate: number; head: number; efficiency: number; power: number; npsh_required: number; is_unstable?: boolean }
interface Props {
  points: CurvePoint[]
  designFlow?: number   // m³/s
  designHead?: number   // m
}

export default function CurvesChart({ points, designFlow, designHead }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [showNpsh, setShowNpsh] = useState(false)

  if (points.length === 0) return null

  const W = 600, H = 340
  const pad = { top: 20, right: 80, bottom: 44, left: 56 }
  const cW = W - pad.left - pad.right
  const cH = H - pad.top - pad.bottom

  const qV = points.map(p => p.flow_rate * 3600)
  const hV = points.map(p => p.head)
  const eV = points.map(p => p.efficiency * 100)
  const npshV = points.map(p => p.npsh_required)

  const qMin = Math.min(...qV), qMax = Math.max(...qV)
  const hMax = Math.max(...hV) * 1.15
  const eMax = 100
  const npshMax = Math.max(...npshV) * 1.2

  const sX = (v: number) => pad.left + ((v - qMin) / (qMax - qMin || 1)) * cW
  const sH = (v: number) => pad.top + cH - (v / hMax) * cH
  const sE = (v: number) => pad.top + cH - (v / eMax) * cH
  const sNpsh = (v: number) => pad.top + cH - (v / npshMax) * cH

  const hLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sX(qV[i])},${sH(hV[i])}`).join(' ')
  const eLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sX(qV[i])},${sE(eV[i])}`).join(' ')
  const npshLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sX(qV[i])},${sNpsh(npshV[i])}`).join(' ')

  // Unstable zone shading (#4)
  const unstableRects: { x1: number; x2: number }[] = []
  let uStart: number | null = null
  points.forEach((p, i) => {
    if (p.is_unstable && uStart === null) uStart = qV[i]
    if (!p.is_unstable && uStart !== null) {
      unstableRects.push({ x1: sX(uStart), x2: sX(qV[i - 1] ?? qV[i]) })
      uStart = null
    }
  })
  if (uStart !== null) unstableRects.push({ x1: sX(uStart), x2: sX(qV[qV.length - 1]) })

  // Design point marker
  const dqX = designFlow != null ? sX(designFlow * 3600) : null
  const dqHy = designHead != null ? sH(designHead) : null

  // BEP (max efficiency)
  const bepIdx = eV.indexOf(Math.max(...eV))
  const bepX = sX(qV[bepIdx])
  const bepEy = sE(eV[bepIdx])

  // Hover
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    // Find nearest point
    let best = 0, bestDist = Infinity
    qV.forEach((q, i) => {
      const d = Math.abs(sX(q) - mx)
      if (d < bestDist) { bestDist = d; best = i }
    })
    setHoverIdx(bestDist < 30 ? best : null)
  }, [qV])

  const hp = hoverIdx != null ? points[hoverIdx] : null

  const axisStyle = { fill: 'var(--text-muted)', fontSize: 11 }
  const gridStyle = { stroke: '#2a2a2a', strokeWidth: 1 }

  const nTicks = 5
  const hTicks = Array.from({ length: nTicks }, (_, i) => (i / (nTicks - 1)) * hMax)
  const qTicks = Array.from({ length: nTicks }, (_, i) => qMin + (i / (nTicks - 1)) * (qMax - qMin))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 14, margin: 0, fontWeight: 700 }}>Curvas de Desempenho</h3>
        {unstableRects.length > 0 && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontWeight: 600 }}>
            ⚠ Zona instável
          </span>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: 'crosshair', display: 'block' }}>
          {/* Grid */}
          {hTicks.map((v, i) => <line key={i} x1={pad.left} x2={W - pad.right} y1={sH(v)} y2={sH(v)} {...gridStyle} />)}
          {qTicks.map((v, i) => <line key={i} x1={sX(v)} x2={sX(v)} y1={pad.top} y2={H - pad.bottom} {...gridStyle} />)}

          {/* Unstable zone shading (#4) */}
          {unstableRects.map((r, i) => (
            <rect key={i} x={r.x1} y={pad.top} width={r.x2 - r.x1} height={cH}
              fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.3)" strokeWidth={1} strokeDasharray="4 3" />
          ))}

          {/* Axes */}
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={H - pad.bottom} stroke="#444" strokeWidth={1} />
          <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="#444" strokeWidth={1} />
          <line x1={W - pad.right} x2={W - pad.right} y1={pad.top} y2={H - pad.bottom} stroke="#444" strokeWidth={1} />

          {/* Axis labels */}
          {hTicks.map((v, i) => <text key={i} x={pad.left - 6} y={sH(v) + 4} textAnchor="end" {...axisStyle}>{v.toFixed(0)}</text>)}
          {qTicks.map((v, i) => <text key={i} x={sX(v)} y={H - pad.bottom + 14} textAnchor="middle" {...axisStyle}>{v.toFixed(0)}</text>)}
          <text x={12} y={H / 2} textAnchor="middle" transform={`rotate(-90,12,${H/2})`} style={{ fill: 'var(--accent)', fontSize: 11 }}>H [m]</text>
          <text x={W / 2} y={H - 4} textAnchor="middle" {...axisStyle}>Q [m³/h]</text>
          <text x={W - 8} y={H / 2} textAnchor="middle" transform={`rotate(90,${W-8},${H/2})`} style={{ fill: '#4caf50', fontSize: 11 }}>η [%]</text>

          {/* Efficiency scale ticks (right axis) */}
          {[0,20,40,60,80,100].map(v => (
            <text key={v} x={W - pad.right + 6} y={sE(v) + 4} textAnchor="start" style={{ fill: '#4caf50', fontSize: 10 }}>{v}</text>
          ))}

          {/* NPSH curve */}
          {showNpsh && <path d={npshLine} stroke="#FFD54F" strokeWidth={1.5} fill="none" strokeDasharray="5 3" />}

          {/* H-Q curve */}
          <path d={hLine} stroke="var(--accent)" strokeWidth={2} fill="none" />

          {/* eta-Q curve */}
          <path d={eLine} stroke="#4caf50" strokeWidth={2} fill="none" />

          {/* Design point vertical line */}
          {dqX != null && (
            <g>
              <line x1={dqX} x2={dqX} y1={pad.top} y2={H - pad.bottom} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 4" />
              {dqHy != null && <circle cx={dqX} cy={dqHy} r={5} fill="var(--accent)" stroke="#fff" strokeWidth={1.5} />}
            </g>
          )}

          {/* BEP marker (diamond) */}
          <g transform={`translate(${bepX},${bepEy})`}>
            <polygon points="0,-6 6,0 0,6 -6,0" fill="#4caf50" stroke="#fff" strokeWidth={1} />
          </g>

          {/* Hover crosshair */}
          {hp != null && hoverIdx != null && (
            <g>
              <line x1={sX(qV[hoverIdx])} x2={sX(qV[hoverIdx])} y1={pad.top} y2={H - pad.bottom} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
              <circle cx={sX(qV[hoverIdx])} cy={sH(hp.head)} r={4} fill="var(--accent)" />
              <circle cx={sX(qV[hoverIdx])} cy={sE(hp.efficiency * 100)} r={4} fill="#4caf50" />
            </g>
          )}
        </svg>

        {/* Hover tooltip */}
        {hp != null && hoverIdx != null && (
          <div style={{
            position: 'absolute',
            left: `calc(${sX(qV[hoverIdx]) / W * 100}% + 12px)`,
            top: '10%',
            background: 'rgba(17,17,17,0.92)',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            pointerEvents: 'none',
            minWidth: 130,
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Q = {(hp.flow_rate * 3600).toFixed(1)} m³/h</div>
            <div>H = <b style={{ color: 'var(--accent)' }}>{hp.head.toFixed(1)} m</b></div>
            <div>η = <b style={{ color: '#4caf50' }}>{(hp.efficiency * 100).toFixed(1)}%</b></div>
            <div>P = <b>{(hp.power / 1000).toFixed(1)} kW</b></div>
            {showNpsh && <div>NPSHr = <b style={{ color: '#FFD54F' }}>{hp.npsh_required.toFixed(1)} m</b></div>}
            {hp.is_unstable && <div style={{ color: 'var(--accent-danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4m0 4h.01M10.29 3.86l-8.6 14.88A1 1 0 002.56 20h16.88a1 1 0 00.87-1.26l-8.6-14.88a1 1 0 00-1.42 0z" /></svg> Zona instável</div>}
          </div>
        )}
      </div>

      {/* Legend + NPSHr toggle unified */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
        {[
          { color: 'var(--accent)', dash: false, label: 'H-Q', shape: 'line' },
          { color: '#4caf50',       dash: false, label: 'η-Q', shape: 'line' },
          { color: 'var(--accent)', dash: false, label: 'Ponto projeto', shape: 'circle' },
          { color: '#4caf50',       dash: false, label: 'BEP', shape: 'diamond' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', fontSize: 11, color: 'var(--text-muted)' }}>
            {l.shape === 'line' && <span style={{ width: 14, height: 2, background: l.color, display: 'inline-block', borderRadius: 1 }} />}
            {l.shape === 'circle' && <span style={{ width: 8, height: 8, background: l.color, borderRadius: '50%', display: 'inline-block', border: '1.5px solid #fff' }} />}
            {l.shape === 'diamond' && <span style={{ width: 8, height: 8, background: l.color, display: 'inline-block', clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }} />}
            {l.label}
          </div>
        ))}
        {/* NPSHr toggle as legend pill */}
        <button onClick={() => setShowNpsh(s => !s)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 12, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
          background: showNpsh ? 'rgba(255,213,79,0.12)' : 'var(--bg-surface)',
          border: `1px solid ${showNpsh ? '#FFD54F' : 'var(--border-primary)'}`,
          color: showNpsh ? '#FFD54F' : 'var(--text-muted)',
          fontFamily: 'var(--font-family)',
        }}>
          <span style={{ width: 14, height: 2, background: '#FFD54F', display: 'inline-block', borderRadius: 1, opacity: showNpsh ? 1 : 0.4,
            backgroundImage: showNpsh ? 'repeating-linear-gradient(90deg,#FFD54F 0,#FFD54F 4px,transparent 4px,transparent 7px)' : 'none' }} />
          NPSHr {showNpsh ? '✓' : ''}
        </button>
      </div>
    </div>
  )
}
