import React, { useEffect, useState } from 'react'

interface Props {
  sizing: any
}

type Variable = 'cm_meridional' | 'cu_swirl' | 'pressure'

export default function MeridionalFlowMap({ sizing }: Props) {
  const [data, setData] = useState<any>(null)
  const [variable, setVariable] = useState<Variable>('cm_meridional')

  useEffect(() => {
    if (!sizing) return
    const mp = sizing.meridional_profile || {}
    const d1 = mp.d1 || 0.08, d2 = mp.d2 || 0.16, b2 = mp.b2 || 0.02

    fetch('/api/v1/geometry/meridional/slc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_rate: 0.05, rpm: 1450, n_stations: 7,
        hub_profile_r: [d1*0.3/2, d1*0.3/2, d2*0.9/2, d2/2],
        hub_profile_z: [0, b2*0.2, b2*0.7, b2],
        shr_profile_r: [d1/2, d1/2, d2/2, d2/2],
        shr_profile_z: [0, 0, b2*0.3, b2],
      }),
    }).then(r => r.json()).then(setData).catch(() => null)
  }, [sizing])

  if (!data) return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
      Calculando campo de escoamento...
    </div>
  )

  const W = 480, H = 220, pad = { l: 50, r: 30, t: 30, b: 30 }
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b

  const vals: number[] = (data[variable] || []) as number[]
  const minV = Math.min(...vals), maxV = Math.max(...vals, minV + 0.001)
  const rs: number[] = data.r_stations || []
  const zs: number[] = data.z_stations || []
  const rMax = Math.max(...rs, 0.001), zMax = Math.max(...zs, 0.001)

  const lerp = (a: number, b: number, t: number) => a + t * (b - a)
  const colormap = (v: number) => {
    const t = (v - minV) / (maxV - minV)
    const r = Math.round(lerp(0, 255, t))
    const g = Math.round(lerp(50, 100, 1 - Math.abs(t - 0.5) * 2))
    const b = Math.round(lerp(255, 0, t))
    return `rgb(${r},${g},${b})`
  }

  const label = { cm_meridional: 'Velocidade Meridional [m/s]', cu_swirl: 'Velocidade de Redemoinho [m/s]', pressure: 'Pressão relativa [Pa]' }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--border-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ color: 'var(--accent)', margin: 0, fontSize: 14 }}>Campo de Escoamento Meridional</h3>
        <select value={variable} onChange={e => setVariable(e.target.value as Variable)}
          style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 4, padding: '3px 8px', fontSize: 12 }}>
          <option value="cm_meridional">Velocidade Meridional</option>
          <option value="cu_swirl">Velocidade de Redemoinho</option>
          <option value="pressure">Pressão Relativa</option>
        </select>
      </div>
      <svg width={W} height={H} style={{ background: 'var(--bg-primary)', borderRadius: 6 }}>
        {rs.map((r, i) => {
          const cx = pad.l + (zs[i] / zMax) * iW
          const cy = pad.t + (1 - r / rMax) * iH
          const col = colormap(vals[i] || 0)
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={12} fill={col} opacity={0.8} />
              <text x={cx} y={cy+4} fill="#fff" fontSize={8} textAnchor="middle">
                {(vals[i]||0).toFixed(1)}
              </text>
            </g>
          )
        })}
        {/* Connect stations */}
        {rs.map((r, i) => i > 0 ? (
          <line key={i}
            x1={pad.l + (zs[i-1]/zMax)*iW} y1={pad.t + (1-rs[i-1]/rMax)*iH}
            x2={pad.l + (zs[i]/zMax)*iW} y2={pad.t + (1-r/rMax)*iH}
            stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3,2" />
        ) : null)}
        <text x={pad.l+iW/2} y={H-5} fill="var(--text-muted)" fontSize={9} textAnchor="middle">z (axial) →</text>
        <text x={10} y={pad.t+iH/2} fill="var(--text-muted)" fontSize={9} textAnchor="middle" transform={`rotate(-90,10,${pad.t+iH/2})`}>r (radial)</text>
      </svg>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{label[variable]}: {minV.toFixed(2)} – {maxV.toFixed(2)}</div>
    </div>
  )
}
