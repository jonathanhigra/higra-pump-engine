import React from 'react'

interface Props {
  sizing: any
}

export default function SpanwiseLoadingChart({ sizing }: Props) {
  if (!sizing) {
    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 20, border: '1px solid var(--border-primary)', color: 'var(--text-muted)', fontSize: 13 }}>
        Execute o dimensionamento para ver a distribuição spanwise.
      </div>
    )
  }

  const spa = sizing.spanwise_blade_angles || {}
  const beta1_hub = spa.beta1_hub ?? sizing.beta1 ?? 25
  const beta1_mid = spa.beta1_mid ?? sizing.beta1 ?? 25
  const beta1_shr = spa.beta1_shr ?? (sizing.beta1 != null ? sizing.beta1 * 0.9 : 22)
  const beta2 = sizing.beta2 ?? 22
  const eta = sizing.estimated_efficiency ?? 0.8

  const spans = [
    { label: 'Hub', beta1: beta1_hub, color: '#4fc3f7' },
    { label: 'Mid', beta1: beta1_mid, color: '#a5d6a7' },
    { label: 'Shroud', beta1: beta1_shr, color: '#ef9a9a' },
  ]

  const W = 440, H = 200
  const pad = { l: 56, r: 20, t: 20, b: 36 }
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b
  const barW = iW / (spans.length * 2 + 1)
  const angleMax = Math.max(beta1_hub, beta1_mid, beta1_shr, beta2) * 1.2

  const toY = (deg: number) => pad.t + (1 - deg / angleMax) * iH

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 20, border: '1px solid var(--border-primary)' }}>
      <h3 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 15 }}>
        Distribuição Spanwise de Ângulos de Pá
      </h3>

      <svg width={W} height={H} style={{ background: 'var(--bg-primary)', borderRadius: 6, display: 'block' }}>
        {/* Grid */}
        {[0.25, 0.5, 0.75, 1].map(v => (
          <g key={v}>
            <line x1={pad.l} y1={toY(angleMax * v)} x2={pad.l + iW} y2={toY(angleMax * v)}
              stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5} />
            <text x={pad.l - 4} y={toY(angleMax * v) + 4}
              fill="var(--text-muted)" fontSize={9} textAnchor="end">
              {(angleMax * v).toFixed(0)}°
            </text>
          </g>
        ))}
        {/* Axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + iH} stroke="var(--text-muted)" strokeWidth={1} />
        <line x1={pad.l} y1={pad.t + iH} x2={pad.l + iW} y2={pad.t + iH} stroke="var(--text-muted)" strokeWidth={1} />

        {/* beta2 reference line */}
        <line x1={pad.l} y1={toY(beta2)} x2={pad.l + iW} y2={toY(beta2)}
          stroke="#ffb300" strokeWidth={1.5} strokeDasharray="6,3" />
        <text x={pad.l + iW - 4} y={toY(beta2) - 3} fill="#ffb300" fontSize={9} textAnchor="end">
          β2 = {beta2.toFixed(1)}°
        </text>

        {/* Bars for beta1 at each span */}
        {spans.map((sp, i) => {
          const x = pad.l + (i * 2 + 0.5) * barW + barW * 0.1
          const bw = barW * 1.3
          const y = toY(sp.beta1)
          const barH = (pad.t + iH) - y
          return (
            <g key={sp.label}>
              <rect x={x} y={y} width={bw} height={barH}
                fill={sp.color} opacity={0.8} rx={2} />
              <text x={x + bw / 2} y={y - 4} fill={sp.color} fontSize={9} textAnchor="middle">
                {sp.beta1.toFixed(1)}°
              </text>
              <text x={x + bw / 2} y={pad.t + iH + 14} fill="var(--text-muted)" fontSize={9} textAnchor="middle">
                {sp.label}
              </text>
            </g>
          )
        })}

        {/* Y axis label */}
        <text x={10} y={pad.t + iH / 2} fill="var(--text-secondary)" fontSize={9} textAnchor="middle"
          transform={`rotate(-90, 10, ${pad.t + iH / 2})`}>β1 [°]</text>
      </svg>

      {/* Value table */}
      <table style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', paddingRight: 16, color: 'var(--text-muted)', fontWeight: 400 }}>Posição</th>
            <th style={{ textAlign: 'right', paddingRight: 16, color: 'var(--text-muted)', fontWeight: 400 }}>β1 [°]</th>
            <th style={{ textAlign: 'right', paddingRight: 16, color: 'var(--text-muted)', fontWeight: 400 }}>β2 [°]</th>
            <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 400 }}>Carga rel.</th>
          </tr>
        </thead>
        <tbody>
          {spans.map(sp => (
            <tr key={sp.label}>
              <td style={{ color: sp.color, padding: '2px 16px 2px 0' }}>{sp.label}</td>
              <td style={{ textAlign: 'right', paddingRight: 16 }}>{sp.beta1.toFixed(2)}</td>
              <td style={{ textAlign: 'right', paddingRight: 16 }}>{beta2.toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>{(eta * sp.beta1 / beta1_hub).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
