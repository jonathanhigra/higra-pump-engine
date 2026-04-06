import React, { useState } from 'react'
import t from '../i18n'

interface Props { stress: any }

export default function StressView({ stress }: Props) {
  const [showCampbell, setShowCampbell] = useState(false)
  if (!stress) return <p style={{ color: 'var(--text-muted)' }}>{t.stressUnavailable}</p>

  const sfColor = (sf: number) => sf >= 2.0 ? 'var(--accent-success)' : sf >= 1.5 ? 'var(--accent-warning)' : 'var(--accent-danger)'

  const row = (label: string, value: string, unit = '') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span><b>{value}</b>{unit ? ' ' + unit : ''}</span>
    </div>
  )

  const fn1 = stress.first_natural_freq ?? 80
  const rpm_design = stress.rpm_design ?? 1750
  const blade_count = stress.blade_count ?? 7

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: 0 }}>{t.structuralAnalysis}</h3>
        <button
          onClick={() => setShowCampbell(s => !s)}
          style={{ marginLeft: 'auto', background: showCampbell ? 'rgba(0,160,223,0.15)' : 'none', border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 10px', fontSize: 11 }}
        >
          Diagrama de Campbell {showCampbell ? '✓' : ''}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
        <div className="card">
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{t.centrifugalStress}</h4>
          {row(t.root, (stress.centrifugal_stress_root / 1e6).toFixed(1), 'MPa')}
          {row(t.tip, (stress.centrifugal_stress_tip / 1e6).toFixed(1), 'MPa')}
        </div>
        <div className="card">
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{t.bendingStress}</h4>
          {row(t.leadingEdge, (stress.bending_stress_le / 1e6).toFixed(1), 'MPa')}
          {row(t.trailingEdge, (stress.bending_stress_te / 1e6).toFixed(1), 'MPa')}
          {row(t.maximum, (stress.bending_stress_max / 1e6).toFixed(1), 'MPa')}
        </div>
        <div className="card">
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{t.combined}</h4>
          {row('Von Mises', (stress.von_mises_max / 1e6).toFixed(1), 'MPa')}
        </div>
        <div className="card">
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{t.safetyFactors}</h4>
          {[{ l: t.yieldSF, v: stress.sf_yield }, { l: t.fatigueSF, v: stress.sf_fatigue }, { l: t.ultimateSF, v: stress.sf_ultimate }].map(({ l, v }) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>{l}</span>
              <span style={{ color: sfColor(v), fontWeight: 700 }}>{v.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
        <div className="card" style={{ background: 'rgba(33,150,243,0.08)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)' }}>{t.vibration}</h4>
          {row(t.naturalFreq, fn1.toFixed(0), 'Hz')}
          {row(t.campbellMargin, (stress.campbell_margin * 100).toFixed(0), '%')}
        </div>
        <div className="card" style={{
          background: stress.is_safe ? 'rgba(76,175,80,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${stress.is_safe ? 'var(--accent-success)' : 'var(--accent-danger)'}`,
        }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: stress.is_safe ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
            {stress.is_safe ? t.safe : t.warning}
          </h4>
          {stress.warnings?.length > 0
            ? stress.warnings.map((w: string, i: number) => <p key={i} style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{w}</p>)
            : <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{t.allSafetyOk}</p>
          }
        </div>
      </div>

      {/* Campbell Diagram (#16) */}
      {showCampbell && (
        <CampbellDiagram
          naturalFreqs={[fn1, fn1 * 1.62, fn1 * 2.8]}
          rpmDesign={rpm_design}
          bladeCount={blade_count}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Campbell Diagram (#16)
// ---------------------------------------------------------------------------
function CampbellDiagram({
  naturalFreqs,
  rpmDesign,
  bladeCount,
}: {
  naturalFreqs: number[]
  rpmDesign: number
  bladeCount: number
}) {
  const W = 560, H = 280
  const pad = { top: 20, right: 20, bottom: 40, left: 60 }
  const cW = W - pad.left - pad.right
  const cH = H - pad.top - pad.bottom

  const rpmMax = rpmDesign * 1.3
  const freqMax = Math.max(...naturalFreqs) * 1.1

  const sx = (rpm: number) => pad.left + (rpm / rpmMax) * cW
  const sy = (f: number) => pad.top + cH - (f / freqMax) * cH

  // Engine orders to plot: 1×, 2×, Z×, (Z±1)×
  const orders = [1, 2, bladeCount - 1, bladeCount, bladeCount + 1, bladeCount * 2]
  const orderColors: Record<number, string> = {
    1: '#666', 2: '#888',
    [bladeCount - 1]: '#FFD54F', [bladeCount]: '#ef4444',
    [bladeCount + 1]: '#FFD54F', [bladeCount * 2]: '#ff8800',
  }

  // Danger zones: where natural freq lines cross engine order lines
  type Cross = { rpm: number; order: number; fn: number; danger: boolean }
  const crossings: Cross[] = []
  naturalFreqs.forEach(fn => {
    orders.forEach(order => {
      const rpmCross = (fn / order) * 60  // f = n/60 * order → n = f*60/order
      if (rpmCross > 0 && rpmCross < rpmMax) {
        const margin = Math.abs(rpmCross - rpmDesign) / rpmDesign
        crossings.push({ rpm: rpmCross, order, fn, danger: margin < 0.1 })
      }
    })
  })

  const natColors = ['var(--accent)', '#4caf50', '#9c27b0']
  const axisStyle = { fill: '#6b7280', fontSize: 10 }

  const rpmTicks = [0, rpmMax * 0.25, rpmMax * 0.5, rpmMax * 0.75, rpmMax]
  const freqTicks = [0, freqMax * 0.25, freqMax * 0.5, freqMax * 0.75, freqMax]

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>
        Diagrama de Campbell — Frequências Naturais vs Excitações
      </h4>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Grid */}
        {rpmTicks.map((v, i) => <line key={i} x1={sx(v)} x2={sx(v)} y1={pad.top} y2={H - pad.bottom} stroke="#1f1f1f" strokeWidth={1} />)}
        {freqTicks.map((v, i) => <line key={i} x1={pad.left} x2={W - pad.right} y1={sy(v)} y2={sy(v)} stroke="#1f1f1f" strokeWidth={1} />)}

        {/* Axes */}
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="#444" strokeWidth={1} />
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={H - pad.bottom} stroke="#444" strokeWidth={1} />

        {/* Axis labels */}
        {rpmTicks.map((v, i) => <text key={i} x={sx(v)} y={H - pad.bottom + 14} textAnchor="middle" {...axisStyle}>{v.toFixed(0)}</text>)}
        {freqTicks.map((v, i) => <text key={i} x={pad.left - 6} y={sy(v) + 4} textAnchor="end" {...axisStyle}>{v.toFixed(0)}</text>)}
        <text x={W / 2} y={H - 4} textAnchor="middle" {...axisStyle}>Rotação [rpm]</text>
        <text x={12} y={H / 2} textAnchor="middle" transform={`rotate(-90,12,${H / 2})`} {...axisStyle}>Frequência [Hz]</text>

        {/* Design speed vertical line */}
        <line x1={sx(rpmDesign)} x2={sx(rpmDesign)} y1={pad.top} y2={H - pad.bottom} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 4" />
        <text x={sx(rpmDesign) + 3} y={pad.top + 10} style={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}>n_op</text>

        {/* Engine order lines */}
        {orders.map(order => {
          const fAtMax = (rpmMax / 60) * order
          if (fAtMax > freqMax * 1.1) return null
          const color = orderColors[order] ?? '#555'
          return (
            <g key={order}>
              <line x1={sx(0)} y1={sy(0)} x2={sx(rpmMax)} y2={sy(fAtMax)} stroke={color} strokeWidth={1} strokeDasharray={order === bladeCount ? '6 2' : '3 4'} opacity={0.7} />
              <text x={sx(rpmMax) - 4} y={sy(Math.min(fAtMax, freqMax)) - 3} textAnchor="end" style={{ fill: color, fontSize: 9 }}>{order}×</text>
            </g>
          )
        })}

        {/* Natural frequency horizontal lines */}
        {naturalFreqs.map((fn, i) => (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={sy(fn)} y2={sy(fn)} stroke={natColors[i]} strokeWidth={1.5} />
            <text x={W - pad.right + 3} y={sy(fn) + 4} style={{ fill: natColors[i], fontSize: 9 }}>f{i + 1}</text>
          </g>
        ))}

        {/* Crossing markers */}
        {crossings.map((c, i) => (
          <circle key={i} cx={sx(c.rpm)} cy={sy(c.fn)} r={c.danger ? 6 : 3}
            fill={c.danger ? 'rgba(239,68,68,0.8)' : 'rgba(255,213,79,0.5)'}
            stroke={c.danger ? '#ef4444' : '#FFD54F'} strokeWidth={1} />
        ))}
      </svg>

      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginTop: 6, flexWrap: 'wrap' }}>
        {naturalFreqs.map((fn, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 2, background: natColors[i], display: 'inline-block' }} />
            f{i + 1} = {fn.toFixed(0)} Hz
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(239,68,68,0.8)', display: 'inline-block' }} />
          Ressonância (&lt;10% margem)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,213,79,0.5)', display: 'inline-block' }} />
          Interseção
        </span>
      </div>

      {crossings.filter(c => c.danger).length > 0 && (
        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 4, fontSize: 11, color: 'var(--accent-danger)' }}>
          ⚠ {crossings.filter(c => c.danger).length} zona(s) de ressonância próxima ao ponto de operação.
        </div>
      )}
    </div>
  )
}
