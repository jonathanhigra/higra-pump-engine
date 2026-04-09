/**
 * AdvancedCharts — 5 componentes de visualização para Fases 17-20.
 *
 * #31 LossAuditPieChart  — donut SVG por zona
 * #32 SpanwiseLoadingChart — multi-curve hub/mid/tip
 * #33 PulsationsFFTChart — espectro com picos BPF marcados
 * #34 RadialForcesPolarPlot — ângulo + magnitude no plano
 * #35 MeshQualityDashboard — gauges orthogonality/skewness/AR
 */
import React from 'react'

// ===========================================================================
// #31 Loss Audit Pie/Donut
// ===========================================================================

interface LossAuditPieProps {
  labels: string[]
  values: number[]
  colors?: string[]
  totalW?: number
}

export function LossAuditPieChart({ labels, values, colors, totalW }: LossAuditPieProps) {
  const total = values.reduce((a, b) => a + b, 0) || 1
  const cx = 110, cy = 110, R = 90, r = 50
  const palette = colors || ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#6366f1']

  let acc = 0
  const arcs = values.map((v, i) => {
    const frac = v / total
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2
    acc += v
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2
    const large = (a1 - a0) > Math.PI ? 1 : 0

    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0)
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1)
    const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1)
    const x3 = cx + r * Math.cos(a0), y3 = cy + r * Math.sin(a0)
    const d = `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`

    // Label position
    const am = (a0 + a1) / 2
    const lx = cx + (R + 14) * Math.cos(am)
    const ly = cy + (R + 14) * Math.sin(am)

    return { d, color: palette[i % palette.length], label: labels[i], frac, lx, ly }
  })

  return (
    <svg width="100%" viewBox="0 0 440 240" style={{ overflow: 'visible' }}>
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill={a.color} stroke="var(--card-bg)" strokeWidth={1.5} />
      ))}

      {/* Center label */}
      <text x={cx} y={cy - 4} fontSize={11} fill="var(--text-muted)" textAnchor="middle">Total</text>
      <text x={cx} y={cy + 12} fontSize={14} fontWeight={700} fill="var(--text-primary)" textAnchor="middle">
        {totalW ? `${(totalW / 1000).toFixed(1)} kW` : '—'}
      </text>

      {/* Legend */}
      {arcs.map((a, i) => (
        <g key={`leg-${i}`}>
          <rect x={240} y={20 + i * 18} width={12} height={12} fill={a.color} />
          <text x={258} y={30 + i * 18} fontSize={11} fill="var(--text-primary)">
            {a.label} — {(a.frac * 100).toFixed(1)}%
          </text>
        </g>
      ))}
    </svg>
  )
}

// ===========================================================================
// #32 Spanwise Loading multi-curve
// ===========================================================================

interface SpanwiseLoadingProps {
  bySpan: Record<string, { xi: number[]; delta_cp: number[] }>
  height?: number
}

export function SpanwiseLoadingChart({ bySpan, height = 220 }: SpanwiseLoadingProps) {
  const W = 520, H = height, PL = 50, PR = 20, PT = 12, PB = 32
  const spans = Object.keys(bySpan).sort((a, b) => parseFloat(a) - parseFloat(b))
  if (spans.length === 0) return null

  // Common scale
  const allDc = spans.flatMap(s => bySpan[s].delta_cp)
  const dcMin = Math.min(0, ...allDc)
  const dcMax = Math.max(...allDc) * 1.1

  const cx = (xi: number) => PL + xi * (W - PL - PR)
  const cy = (dc: number) => PT + (1 - (dc - dcMin) / (dcMax - dcMin || 1)) * (H - PT - PB)

  const COLORS = ['#3b82f6', '#22c55e', '#f59e0b']
  const LABELS = ['hub', 'mid', 'tip']

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1.0].map(f => (
        <line key={f} x1={PL} y1={cy(dcMin + f * (dcMax - dcMin))}
              x2={W - PR} y2={cy(dcMin + f * (dcMax - dcMin))}
              stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="3 3" />
      ))}

      {/* Curves */}
      {spans.map((s, idx) => {
        const data = bySpan[s]
        const d = data.xi.map((x, i) => `${i === 0 ? 'M' : 'L'}${cx(x).toFixed(1)},${cy(data.delta_cp[i]).toFixed(1)}`).join(' ')
        return (
          <g key={s}>
            <path d={d} fill="none" stroke={COLORS[idx % 3]} strokeWidth={2} />
          </g>
        )
      })}

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--border-primary)" />
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--border-primary)" />

      {/* Y ticks */}
      {[0, 0.25, 0.5, 0.75, 1.0].map(f => {
        const v = dcMin + f * (dcMax - dcMin)
        return (
          <text key={f} x={PL - 4} y={cy(v) + 4} fontSize={9}
                fill="var(--text-muted)" textAnchor="end">{v.toFixed(2)}</text>
        )
      })}

      {/* X ticks */}
      {[0, 0.5, 1.0].map(x => (
        <text key={x} x={cx(x)} y={H - PB + 14} fontSize={9}
              fill="var(--text-muted)" textAnchor="middle">{x.toFixed(1)}</text>
      ))}

      {/* Axis labels */}
      <text x={PL + (W - PL - PR) / 2} y={H - 2} fontSize={10}
            fill="var(--text-muted)" textAnchor="middle">xi (chord position)</text>
      <text x={PL - 32} y={PT + (H - PT - PB) / 2} fontSize={10}
            fill="var(--text-muted)" textAnchor="middle"
            transform={`rotate(-90 ${PL - 32} ${PT + (H - PT - PB) / 2})`}>ΔCp</text>

      {/* Legend */}
      {spans.map((s, idx) => (
        <g key={`leg-${s}`}>
          <line x1={PL + 20 + idx * 60} y1={PT + 8} x2={PL + 32 + idx * 60} y2={PT + 8}
                stroke={COLORS[idx % 3]} strokeWidth={2} />
          <text x={PL + 36 + idx * 60} y={PT + 12} fontSize={10} fill={COLORS[idx % 3]}>
            {LABELS[idx] || `s=${s}`}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ===========================================================================
// #33 Pulsations FFT
// ===========================================================================

interface PulsationsFFTProps {
  frequencies: number[]
  amplitudes: number[]
  bpfHz: number
}

export function PulsationsFFTChart({ frequencies, amplitudes, bpfHz }: PulsationsFFTProps) {
  const W = 520, H = 200, PL = 56, PR = 20, PT = 12, PB = 30
  if (frequencies.length === 0 || amplitudes.length === 0) return null

  const fMax = Math.max(...frequencies)
  const aMax = Math.max(...amplitudes)

  const cx = (f: number) => PL + (f / fMax) * (W - PL - PR)
  const cy = (a: number) => PT + (1 - a / aMax) * (H - PT - PB)

  const path = frequencies.map((f, i) => `${i === 0 ? 'M' : 'L'}${cx(f).toFixed(1)},${cy(amplitudes[i]).toFixed(1)}`).join(' ')

  // BPF marker lines
  const bpfMarkers = [bpfHz, 2 * bpfHz, 3 * bpfHz].filter(b => b < fMax)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* BPF marker lines */}
      {bpfMarkers.map((b, i) => (
        <g key={i}>
          <line x1={cx(b)} y1={PT} x2={cx(b)} y2={H - PB}
                stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          <text x={cx(b) + 4} y={PT + 12} fontSize={9} fill="#ef4444">
            {i === 0 ? 'BPF' : `${i + 1}×BPF`}
          </text>
        </g>
      ))}

      {/* Spectrum */}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      <path d={`${path} L${cx(frequencies[frequencies.length-1]).toFixed(1)},${(H - PB).toFixed(1)} L${cx(frequencies[0]).toFixed(1)},${(H - PB).toFixed(1)} Z`}
            fill="var(--accent)" fillOpacity={0.15} />

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--border-primary)" />
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--border-primary)" />

      {/* Labels */}
      <text x={PL + (W - PL - PR) / 2} y={H - 4} fontSize={10}
            fill="var(--text-muted)" textAnchor="middle">Frequência (Hz)</text>
      <text x={PL - 36} y={PT + (H - PT - PB) / 2} fontSize={10}
            fill="var(--text-muted)" textAnchor="middle"
            transform={`rotate(-90 ${PL - 36} ${PT + (H - PT - PB) / 2})`}>Amplitude (Pa)</text>
    </svg>
  )
}

// ===========================================================================
// #34 Radial forces polar plot
// ===========================================================================

interface RadialForcesPolarProps {
  samples: { fx: number; fy: number; t: number }[]
  meanAngleDeg?: number
}

export function RadialForcesPolarPlot({ samples, meanAngleDeg }: RadialForcesPolarProps) {
  if (samples.length === 0) return null
  const W = 320, H = 320, cx = W / 2, cy = H / 2

  const fMags = samples.map(s => Math.hypot(s.fx, s.fy))
  const fMax = Math.max(...fMags)
  const scale = (W / 2 - 30) / Math.max(fMax, 1e-6)

  // Plot trajectory
  const path = samples.map((s, i) => {
    const x = cx + s.fx * scale
    const y = cy - s.fy * scale  // SVG y inverted
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Mean direction arrow
  const meanRad = (meanAngleDeg ?? 0) * Math.PI / 180
  const meanFmag = fMags.reduce((a, b) => a + b, 0) / fMags.length
  const arrX = cx + Math.cos(meanRad) * meanFmag * scale
  const arrY = cy - Math.sin(meanRad) * meanFmag * scale

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* Concentric grid */}
      {[0.25, 0.5, 0.75, 1.0].map(f => (
        <circle key={f} cx={cx} cy={cy} r={(W / 2 - 30) * f}
                fill="none" stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="3 3" />
      ))}
      {/* Cross-hair */}
      <line x1={20} y1={cy} x2={W - 20} y2={cy} stroke="var(--border-primary)" strokeWidth={0.5} />
      <line x1={cx} y1={20} x2={cx} y2={H - 20} stroke="var(--border-primary)" strokeWidth={0.5} />

      {/* Trajectory */}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0.7} />

      {/* Mean arrow */}
      <line x1={cx} y1={cy} x2={arrX} y2={arrY}
            stroke="#ef4444" strokeWidth={2} markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" />
        </marker>
      </defs>

      {/* Labels */}
      <text x={W - 20} y={cy - 6} fontSize={10} fill="var(--text-muted)" textAnchor="end">Fx →</text>
      <text x={cx + 6} y={20} fontSize={10} fill="var(--text-muted)">↑ Fy</text>
      <text x={cx} y={H - 8} fontSize={11} fill="var(--text-primary)" textAnchor="middle">
        Trajetória força radial
      </text>
    </svg>
  )
}

// ===========================================================================
// #35 Mesh quality dashboard
// ===========================================================================

interface MeshQualityDashboardProps {
  maxNonOrthogonality: number
  maxSkewness: number
  maxAspectRatio: number
  nCells: number
  meshOk: boolean
}

export function MeshQualityDashboard({
  maxNonOrthogonality, maxSkewness, maxAspectRatio, nCells, meshOk,
}: MeshQualityDashboardProps) {
  const gauges = [
    { label: 'Non-orthogonality', value: maxNonOrthogonality, max: 90, threshold: 70, unit: '°' },
    { label: 'Skewness', value: maxSkewness, max: 10, threshold: 5, unit: '' },
    { label: 'Aspect ratio', value: maxAspectRatio, max: 100, threshold: 30, unit: '' },
  ]

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: meshOk ? '#22c55e' : '#ef4444',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700,
        }}>
          {meshOk ? '✓' : '✗'}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {nCells.toLocaleString('en')} cells
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Quality: {meshOk ? 'PASS' : 'FAIL'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {gauges.map(g => {
          const pct = Math.min(1, g.value / g.max)
          const exceeded = g.value > g.threshold
          return (
            <div key={g.label} style={{
              background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{g.label}</div>
              <div style={{
                fontSize: 16, fontWeight: 700,
                color: exceeded ? '#ef4444' : 'var(--text-primary)',
              }}>
                {g.value.toFixed(2)}{g.unit}
              </div>
              <div style={{
                height: 4, background: 'var(--bg-primary)', borderRadius: 2, marginTop: 6,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct * 100}%`, height: '100%',
                  background: exceeded ? '#ef4444' : '#22c55e',
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                threshold: {g.threshold}{g.unit}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
