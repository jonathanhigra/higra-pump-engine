import React, { useEffect, useState } from 'react'

interface Props {
  sizing: any
}

export default function PressureDistribution({ sizing }: Props) {
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sizing) return
    setFetching(true)
    setError(null)

    const vt = sizing.velocity_triangles || {}
    const inlet = vt.inlet || {}
    const outlet = vt.outlet || {}
    const w_in = inlet.w || 5.0
    const w_out = outlet.w || 3.0

    fetch('/api/v1/geometry/loading/pressure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        m_norm: Array.from({ length: 21 }, (_, i) => i / 20),
        rvt: Array.from({ length: 21 }, (_, i) => sizing.estimated_efficiency * 0.5 * (i / 20)),
        drvt_dm: Array.from({ length: 21 }, () => sizing.estimated_efficiency * 0.025),
        ps_excess: Array.from({ length: 21 }, () => -0.1),
        ss_excess: Array.from({ length: 21 }, () => 0.1),
        w_inlet: w_in,
        w_outlet: w_out,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setFetching(false))
  }, [sizing])

  const W = 500, H = 200
  const pad = { l: 45, r: 20, t: 20, b: 30 }
  const iW = W - pad.l - pad.r
  const iH = H - pad.t - pad.b

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderRadius: 8,
    padding: 20,
    border: '1px solid var(--border-primary)',
  }

  const heading = (
    <h3 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 15 }}>
      Distribuição de Velocidade PS/SS
    </h3>
  )

  if (fetching) {
    return (
      <div style={cardStyle}>
        {heading}
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando distribuição de pressão...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={cardStyle}>
        {heading}
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {error ? `Erro: ${error}` : 'Nenhum dado disponível. Execute o dimensionamento primeiro.'}
        </div>
      </div>
    )
  }

  const m: number[] = data.m_norm || []
  const w_ps: number[] = data.w_ps || []
  const w_ss: number[] = data.w_ss || []
  const cp_ps: number[] = data.cp_ps || []
  const cp_ss: number[] = data.cp_ss || []

  const wMax = Math.max(...w_ps, ...w_ss, 1)

  const toX = (mi: number) => pad.l + mi * iW
  const toYw = (w: number) => pad.t + (1 - w / wMax) * iH

  const pathPS = m.map((mi, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(mi).toFixed(1)} ${toYw(w_ps[i] || 0).toFixed(1)}`
  ).join(' ')
  const pathSS = m.map((mi, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(mi).toFixed(1)} ${toYw(w_ss[i] || 0).toFixed(1)}`
  ).join(' ')

  // Cp chart — second SVG
  const cpAll = [...cp_ps, ...cp_ss].filter(v => isFinite(v))
  const cpMin = Math.min(...cpAll, -0.5)
  const cpMax = Math.max(...cpAll, 0.5)
  const cpRange = cpMax - cpMin || 1

  const toYcp = (cp: number) => pad.t + ((cpMax - cp) / cpRange) * iH
  const cpZeroY = toYcp(0)

  const pathCpPS = m.map((mi, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(mi).toFixed(1)} ${toYcp(cp_ps[i] || 0).toFixed(1)}`
  ).join(' ')
  const pathCpSS = m.map((mi, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(mi).toFixed(1)} ${toYcp(cp_ss[i] || 0).toFixed(1)}`
  ).join(' ')

  const gridLines = [0.25, 0.5, 0.75, 1]

  return (
    <div style={cardStyle}>
      {heading}

      {/* Velocity (w) chart */}
      <svg width={W} height={H} style={{ background: 'var(--bg-primary)', borderRadius: 6, display: 'block' }}>
        {gridLines.map(v => (
          <line key={v} x1={toX(v)} y1={pad.t} x2={toX(v)} y2={pad.t + iH}
            stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5} />
        ))}
        <line x1={pad.l} y1={pad.t + iH} x2={pad.l + iW} y2={pad.t + iH} stroke="var(--text-muted)" strokeWidth={1} />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + iH} stroke="var(--text-muted)" strokeWidth={1} />
        <path d={pathPS} stroke="#4fc3f7" strokeWidth={2} fill="none" />
        <path d={pathSS} stroke="#ef9a9a" strokeWidth={2} fill="none" />
        <text x={pad.l + 10} y={pad.t + 14} fill="#4fc3f7" fontSize={10}>PS (lado de pressão)</text>
        <text x={pad.l + 10} y={pad.t + 26} fill="#ef9a9a" fontSize={10}>SS (lado de sucção)</text>
        <text x={toX(0)} y={H - 5} fill="var(--text-muted)" fontSize={9}>LE</text>
        <text x={toX(1) - 10} y={H - 5} fill="var(--text-muted)" fontSize={9}>TE</text>
        <text x={5} y={pad.t + iH / 2 + 4} fill="var(--text-muted)" fontSize={9}
          transform={`rotate(-90, 9, ${pad.t + iH / 2})`} textAnchor="middle">w [m/s]</text>
        {/* Y axis ticks */}
        {[0.5, 1].map(frac => (
          <text key={frac} x={pad.l - 4} y={toYw(wMax * frac) + 4}
            fill="var(--text-muted)" fontSize={9} textAnchor="end">
            {(wMax * frac).toFixed(1)}
          </text>
        ))}
      </svg>

      {/* Cp chart */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          Coeficiente de pressão Cp
        </div>
        <svg width={W} height={H} style={{ background: 'var(--bg-primary)', borderRadius: 6, display: 'block' }}>
          {gridLines.map(v => (
            <line key={v} x1={toX(v)} y1={pad.t} x2={toX(v)} y2={pad.t + iH}
              stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5} />
          ))}
          {/* Zero line */}
          <line x1={pad.l} y1={cpZeroY} x2={pad.l + iW} y2={cpZeroY}
            stroke="var(--text-muted)" strokeWidth={1} />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + iH} stroke="var(--text-muted)" strokeWidth={1} />
          <path d={pathCpPS} stroke="#4fc3f7" strokeWidth={2} fill="none" />
          <path d={pathCpSS} stroke="#ef9a9a" strokeWidth={2} fill="none" />
          <text x={toX(0)} y={H - 5} fill="var(--text-muted)" fontSize={9}>LE</text>
          <text x={toX(1) - 10} y={H - 5} fill="var(--text-muted)" fontSize={9}>TE</text>
          <text x={pad.l - 4} y={cpZeroY + 4} fill="var(--text-muted)" fontSize={9} textAnchor="end">0</text>
          <text x={5} y={pad.t + iH / 2 + 4} fill="var(--text-muted)" fontSize={9}
            transform={`rotate(-90, 9, ${pad.t + iH / 2})`} textAnchor="middle">Cp</text>
        </svg>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        Velocidade de referência: {((data.w_ref as number) || 0).toFixed(1)} m/s
      </div>
    </div>
  )
}
