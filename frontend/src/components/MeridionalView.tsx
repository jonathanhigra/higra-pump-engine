import React, { useMemo } from 'react'

interface Props {
  meridional: {
    d1: number
    d1_hub: number
    d2: number
    b1: number
    b2: number
  }
  blade_count?: number
  beta1?: number
  beta2?: number
}

export default function MeridionalView({ meridional, blade_count, beta1, beta2 }: Props) {
  const { d1, d1_hub, d2, b1, b2 } = meridional
  const r1 = d1 / 2, r1h = d1_hub / 2, r2 = d2 / 2

  // Canvas dimensions
  const W = 500, H = 300
  const padL = 48, padB = 36, padT = 16, padR = 24
  const cW = W - padL - padR, cH = H - padT - padB

  const z_total = 0.8 * (r2 - r1)
  const N = 30

  // Generate hub and shroud curves (same algorithm as backend)
  const { hub, shroud } = useMemo(() => {
    const hub: [number, number][] = []
    const shroud: [number, number][] = []
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const arc = Math.PI / 2 * t
      const rh = r1h + (r2 - r1h) * Math.sin(arc)
      const zh = z_total * (1 - Math.sin(arc))
      const rs = r1 + (r2 - r1) * Math.sin(arc)
      const bl = b1 + t * (b2 - b1)
      hub.push([rh, zh])
      shroud.push([rs, zh + bl])
    }
    return { hub, shroud }
  }, [r1, r1h, r2, b1, b2, z_total])

  // Scale: r on X, z on Y (z increases upward in viewport = decreases in SVG)
  const rMin = 0, rMax = r2 * 1.08
  const zMin = 0, zMax = Math.max(...shroud.map(p => p[1])) * 1.1

  const sx = (r: number) => padL + (r - rMin) / (rMax - rMin || 1) * cW
  const sy = (z: number) => H - padB - (z - zMin) / (zMax - zMin || 1) * cH

  const hubPath = hub.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p[0])},${sy(p[1])}`).join(' ')
  const shroudPath = shroud.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p[0])},${sy(p[1])}`).join(' ')

  // Blade lines (simplified — straight lines in meridional plane)
  const bladeLines: [number, number, number, number][] = []
  const nBladesShown = Math.min(blade_count ?? 7, 7)
  const bladePitch = 2 * Math.PI / (blade_count ?? 7)
  for (let b = 0; b < nBladesShown; b++) {
    const frac = b / nBladesShown
    const i = Math.round(frac * (N - 1))
    const [rh, zh] = hub[Math.min(i, hub.length - 1)]
    const [rs, zs] = shroud[Math.min(i, shroud.length - 1)]
    bladeLines.push([rh, zh, rs, zs])
  }

  const axisStyle = { fill: '#6b7280', fontSize: 10 }

  return (
    <div className="meridional-view">
      <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>Canal Meridional</h4>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Filled channel area */}
        <defs>
          <linearGradient id="channelGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00A0DF" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#00A0DF" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path
          d={`${hubPath} L${sx(shroud[N-1][0])},${sy(shroud[N-1][1])} ` +
             shroud.slice().reverse().map((p, i) => `${i === 0 ? '' : 'L'}${sx(p[0])},${sy(p[1])}`).join(' ') +
             ' Z'}
          fill="url(#channelGrad)" stroke="none"
        />

        {/* Grid */}
        {[0, r2/4, r2/2, 3*r2/4, r2].map((r, i) => (
          <line key={i} x1={sx(r)} x2={sx(r)} y1={padT} y2={H - padB} stroke="#1f1f1f" strokeWidth={1} />
        ))}
        {[0, zMax/4, zMax/2, 3*zMax/4, zMax].map((z, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={sy(z)} y2={sy(z)} stroke="#1f1f1f" strokeWidth={1} />
        ))}

        {/* Axes */}
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#444" strokeWidth={1} />
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#444" strokeWidth={1} />

        {/* Axis labels */}
        {[0, r2/2, r2].map((r, i) => (
          <text key={i} x={sx(r)} y={H - padB + 14} textAnchor="middle" {...axisStyle}>{(r * 1000).toFixed(0)}</text>
        ))}
        <text x={padL + cW/2} y={H - 4} textAnchor="middle" {...axisStyle}>r [mm]</text>
        {[0, zMax/2, zMax].map((z, i) => (
          <text key={i} x={padL - 6} y={sy(z) + 4} textAnchor="end" {...axisStyle}>{(z * 1000).toFixed(0)}</text>
        ))}
        <text x={12} y={H/2} textAnchor="middle" transform={`rotate(-90,12,${H/2})`} {...axisStyle}>z [mm]</text>

        {/* Hub and shroud curves */}
        <path d={hubPath} stroke="#888" strokeWidth={2} fill="none" />
        <path d={shroudPath} stroke="var(--accent)" strokeWidth={2} fill="none" />

        {/* Blade lines */}
        {bladeLines.map(([rh, zh, rs, zs], i) => (
          <line key={i} x1={sx(rh)} y1={sy(zh)} x2={sx(rs)} y2={sy(zs)}
            stroke="rgba(0,160,223,0.6)" strokeWidth={1.5} />
        ))}

        {/* Dimension annotations */}
        {/* D1 arrow */}
        <g>
          <line x1={sx(0)} x2={sx(r1)} y1={sy(z_total * 1.04)} y2={sy(z_total * 1.04)} stroke="#666" strokeWidth={1} markerEnd="url(#arrowR)" />
          <text x={sx(r1/2)} y={sy(z_total * 1.04) - 5} textAnchor="middle" style={{ fill: '#888', fontSize: 10 }}>D1={( d1*1000).toFixed(0)}mm</text>
        </g>
        {/* D2 arrow */}
        <g>
          <line x1={sx(0)} x2={sx(r2)} y1={sy(-zMax*0.05)} y2={sy(-zMax*0.05)} stroke="#666" strokeWidth={1} />
          <text x={sx(r2/2)} y={sy(-zMax*0.05) - 5} textAnchor="middle" style={{ fill: '#888', fontSize: 10 }}>D2={(d2*1000).toFixed(0)}mm</text>
        </g>

        {/* Labels */}
        <text x={sx(hub[hub.length-1][0]) + 5} y={sy(hub[hub.length-1][1])} style={{ fill: '#888', fontSize: 10 }}>Hub</text>
        <text x={sx(shroud[shroud.length-1][0]) + 5} y={sy(shroud[shroud.length-1][1])} style={{ fill: 'var(--accent)', fontSize: 10 }}>Shroud</text>

        {/* Flow direction arrow */}
        <text x={sx(r1 * 0.4)} y={sy(z_total * 0.5)} textAnchor="middle" style={{ fill: '#4caf50', fontSize: 12 }}>↓</text>
        <text x={sx(r2 * 0.9)} y={sy(b2 * 0.5)} textAnchor="middle" style={{ fill: '#4caf50', fontSize: 12 }}>→</text>
      </svg>

      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        <span>D1: {(d1*1000).toFixed(1)} mm</span>
        <span>D2: {(d2*1000).toFixed(1)} mm</span>
        <span>b2: {(b2*1000).toFixed(1)} mm</span>
        {blade_count && <span>Z: {blade_count}</span>}
        {beta1 && <span>β1: {beta1.toFixed(1)}°</span>}
        {beta2 && <span>β2: {beta2.toFixed(1)}°</span>}
      </div>
    </div>
  )
}
