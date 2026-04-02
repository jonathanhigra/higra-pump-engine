import React, { useState, useCallback } from 'react'

interface ControlPoint { r: number; z: number }

interface Props {
  d1?: number   // m — inlet diameter
  d2?: number   // m — outlet diameter
  b2?: number   // m — outlet width
}

// 4 control points define each Bézier curve (CP0=LE, CP3=TE)
const defaultHubCPs = (r1: number, r2: number, zspan: number): ControlPoint[] => [
  { r: r1 * 0.5, z: zspan },
  { r: r1 * 0.5, z: zspan * 0.55 },
  { r: r2 * 0.7, z: zspan * 0.15 },
  { r: r2, z: 0 },
]

const defaultShroudCPs = (r1: number, r2: number, zspan: number, b2: number): ControlPoint[] => [
  { r: r1, z: zspan },
  { r: r1, z: zspan * 0.5 },
  { r: r2 * 0.8, z: b2 * 2 },
  { r: r2, z: b2 },
]

function cubicBezier(cps: ControlPoint[], steps = 40): ControlPoint[] {
  const pts: ControlPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const r = u*u*u*cps[0].r + 3*u*u*t*cps[1].r + 3*u*t*t*cps[2].r + t*t*t*cps[3].r
    const z = u*u*u*cps[0].z + 3*u*u*t*cps[1].z + 3*u*t*t*cps[2].z + t*t*t*cps[3].z
    pts.push({ r, z })
  }
  return pts
}

export default function MeridionalEditor({ d1 = 0.12, d2 = 0.22, b2 = 0.025 }: Props) {
  const r1 = d1 / 2, r2 = d2 / 2
  const zspan = 0.8 * (r2 - r1) + b2

  const [hubCPs, setHubCPs] = useState<ControlPoint[]>(() => defaultHubCPs(r1, r2, zspan))
  const [shrCPs, setShrCPs] = useState<ControlPoint[]>(() => defaultShroudCPs(r1, r2, zspan, b2))
  const [dragging, setDragging] = useState<{ curve: 'hub' | 'shr'; idx: number } | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)

  const W = 500, H = 300
  const pad = { l: 50, r: 20, t: 16, b: 36 }
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b

  const rMax = r2 * 1.15
  const zMax = Math.max(...hubCPs.map(p => p.z), ...shrCPs.map(p => p.z)) * 1.1 || zspan * 1.1

  const sx = (r: number) => pad.l + (r / rMax) * iW
  const sz = (z: number) => H - pad.b - (z / zMax) * iH

  const hubCurve = cubicBezier(hubCPs)
  const shrCurve = cubicBezier(shrCPs)

  const toSvgPath = (pts: ControlPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.r).toFixed(1)} ${sz(p.z).toFixed(1)}`).join(' ')

  const handleMouseDown = (curve: 'hub' | 'shr', idx: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDragging({ curve, idx })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging) return
    const svgEl = e.currentTarget
    const rect = svgEl.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const r = Math.max(0, Math.min(rMax, (mx - pad.l) / iW * rMax))
    const z = Math.max(0, Math.min(zMax, (H - pad.b - my) / iH * zMax))
    const update = (prev: ControlPoint[]) => {
      const next = [...prev]
      next[dragging.idx] = { r, z }
      return next
    }
    if (dragging.curve === 'hub') setHubCPs(update)
    else setShrCPs(update)
  }, [dragging, rMax, zMax, iW, iH, pad.l, pad.b, H])

  const handleMouseUp = useCallback(() => setDragging(null), [])

  const handleApply = async () => {
    setApplying(true)
    setApplyResult(null)
    try {
      const res = await fetch('/api/v1/geometry/meridional/bezier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hub_cps: hubCPs, shroud_cps: shrCPs, d1, d2, b2 }),
      })
      if (res.ok) {
        setApplyResult('Perfil meridional atualizado.')
      } else {
        setApplyResult(`Erro HTTP ${res.status}`)
      }
    } catch (e: any) {
      setApplyResult(`Falha: ${e.message}`)
    } finally {
      setApplying(false)
    }
  }

  const handleReset = () => {
    setHubCPs(defaultHubCPs(r1, r2, zspan))
    setShrCPs(defaultShroudCPs(r1, r2, zspan, b2))
    setApplyResult(null)
  }

  const cpDot = (
    cps: ControlPoint[],
    curve: 'hub' | 'shr',
    color: string,
  ) =>
    cps.map((cp, i) => (
      <circle
        key={`${curve}-${i}`}
        cx={sx(cp.r)} cy={sz(cp.z)} r={6}
        fill={i === 0 || i === 3 ? color : 'var(--bg-card)'}
        stroke={color} strokeWidth={2}
        style={{ cursor: 'grab' }}
        onMouseDown={handleMouseDown(curve, i)}
      />
    ))

  const cpLines = (cps: ControlPoint[], color: string) => (
    <>
      <line x1={sx(cps[0].r)} y1={sz(cps[0].z)} x2={sx(cps[1].r)} y2={sz(cps[1].z)}
        stroke={color} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
      <line x1={sx(cps[2].r)} y1={sz(cps[2].z)} x2={sx(cps[3].r)} y2={sz(cps[3].z)}
        stroke={color} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
    </>
  )

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 20, border: '1px solid var(--border-primary)' }}>
      <h3 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 15 }}>
        Editor de Perfil Meridional (Bézier)
      </h3>

      <svg
        width={W} height={H}
        style={{ background: 'var(--bg-primary)', borderRadius: 6, display: 'block', userSelect: 'none' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid */}
        {[0.25, 0.5, 0.75, 1].map(v => (
          <g key={v}>
            <line x1={sx(rMax * v)} y1={pad.t} x2={sx(rMax * v)} y2={H - pad.b}
              stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5} />
            <text x={sx(rMax * v)} y={H - pad.b + 14} fill="var(--text-muted)" fontSize={9} textAnchor="middle">
              {(rMax * v * 1000).toFixed(0)}
            </text>
          </g>
        ))}
        {[0.25, 0.5, 0.75, 1].map(v => (
          <g key={v}>
            <line x1={pad.l} y1={sz(zMax * v)} x2={pad.l + iW} y2={sz(zMax * v)}
              stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5} />
            <text x={pad.l - 4} y={sz(zMax * v) + 4} fill="var(--text-muted)" fontSize={9} textAnchor="end">
              {(zMax * v * 1000).toFixed(0)}
            </text>
          </g>
        ))}
        {/* Axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--text-muted)" strokeWidth={1} />
        <line x1={pad.l} y1={H - pad.b} x2={pad.l + iW} y2={H - pad.b} stroke="var(--text-muted)" strokeWidth={1} />
        {/* Axis labels */}
        <text x={pad.l + iW / 2} y={H - 4} fill="var(--text-secondary)" fontSize={10} textAnchor="middle">r [mm]</text>
        <text x={12} y={H / 2} fill="var(--text-secondary)" fontSize={10} textAnchor="middle"
          transform={`rotate(-90, 12, ${H / 2})`}>z [mm]</text>

        {/* Filled channel */}
        <path
          d={`${toSvgPath(hubCurve)} L${sx(shrCurve[shrCurve.length - 1].r)} ${sz(shrCurve[shrCurve.length - 1].z)} ` +
            shrCurve.slice().reverse().map((p, i) => `${i === 0 ? '' : 'L'}${sx(p.r)} ${sz(p.z)}`).join(' ') + ' Z'}
          fill="rgba(0,160,223,0.06)" stroke="none"
        />
        {/* Curves */}
        <path d={toSvgPath(hubCurve)} stroke="#888" strokeWidth={2} fill="none" />
        <path d={toSvgPath(shrCurve)} stroke="var(--accent)" strokeWidth={2} fill="none" />

        {/* Control polygon lines */}
        {cpLines(hubCPs, '#888')}
        {cpLines(shrCPs, 'var(--accent)')}

        {/* Control point dots */}
        {cpDot(hubCPs, 'hub', '#aaa')}
        {cpDot(shrCPs, 'shr', 'var(--accent)')}

        {/* Labels */}
        <text x={sx(hubCurve[hubCurve.length - 1].r) + 5} y={sz(hubCurve[hubCurve.length - 1].z)}
          fill="#888" fontSize={10}>Hub</text>
        <text x={sx(shrCurve[shrCurve.length - 1].r) + 5} y={sz(shrCurve[shrCurve.length - 1].z)}
          fill="var(--accent)" fontSize={10}>Shroud</text>
      </svg>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        Arraste os pontos de controle para editar o perfil. Pontos sólidos = LE/TE fixos, vazios = handles.
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          onClick={handleApply}
          disabled={applying}
          style={{
            padding: '7px 18px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 4, cursor: applying ? 'not-allowed' : 'pointer',
            fontSize: 13, opacity: applying ? 0.7 : 1,
          }}
        >
          {applying ? 'Aplicando...' : 'Aplicar Perfil'}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: '7px 14px', background: 'transparent', color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer', fontSize: 13,
          }}
        >
          Resetar
        </button>
      </div>

      {applyResult && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', padding: 6, background: 'var(--bg-surface)', borderRadius: 4 }}>
          {applyResult}
        </div>
      )}
    </div>
  )
}
