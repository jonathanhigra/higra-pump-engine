import React, { useState, useEffect, useRef } from 'react'
import t from '../i18n/pt-br'

interface Triangle { u: number; cm: number; cu: number; c: number; w: number; beta: number; alpha: number }
interface CurveTriangles { flow_ratio: number; inlet: Triangle; outlet: Triangle; euler_head: number }

interface Props {
  triangles: Record<string, any>
  curveData?: CurveTriangles[]  // for animation (#19)
}

export default function VelocityTriangle({ triangles, curveData }: Props) {
  const [animIdx, setAnimIdx] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasAnimation = curveData && curveData.length > 0

  useEffect(() => {
    if (playing && hasAnimation) {
      intervalRef.current = setInterval(() => {
        setAnimIdx(i => {
          const next = (i ?? 0) + 1
          if (next >= (curveData?.length ?? 0)) { setPlaying(false); return null }
          return next
        })
      }, 120)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, hasAnimation])

  // Use animated triangles if available, else design point
  const activeTriangles = (hasAnimation && animIdx != null)
    ? { inlet: curveData![animIdx].inlet, outlet: curveData![animIdx].outlet, euler_head: curveData![animIdx].euler_head }
    : triangles

  const inlet = activeTriangles?.inlet
  const outlet = activeTriangles?.outlet
  const euler = activeTriangles?.euler_head

  if (!inlet || !outlet) return <p style={{ color: 'var(--text-muted)' }}>{t.noVelocityData}</p>

  const W = 640, H = 260
  const maxU = Math.max(inlet.u, outlet.u)
  const maxCm = Math.max(inlet.cm, outlet.cm)
  const scale = Math.min(120 / maxU, 120 / maxCm, 3)

  const draw = (cx: number, cy: number, u: number, cm: number, cu: number, label: string) => {
    const uL = u * scale, cmL = cm * scale, cuL = cu * scale
    return (
      <g>
        <text x={cx} y={cy - cmL - 18} fontSize={13} fontWeight={600} textAnchor="middle" style={{ fill: 'var(--text-primary)' }}>{label}</text>
        {/* u — peripheral velocity (red) */}
        <line x1={cx - uL / 2} y1={cy} x2={cx + uL / 2} y2={cy} stroke="#e74c3c" strokeWidth={2} markerEnd="url(#aR)" />
        <text x={cx} y={cy + 16} fontSize={10} textAnchor="middle" style={{ fill: '#e74c3c' }}>u = {u.toFixed(1)}</text>
        {/* c — absolute velocity (blue) */}
        <line x1={cx - uL / 2} y1={cy} x2={cx - uL / 2 + cuL} y2={cy - cmL} stroke="#2196F3" strokeWidth={2} markerEnd="url(#aB)" />
        <text x={cx - uL / 2 + cuL / 2 - 14} y={cy - cmL / 2} fontSize={10} style={{ fill: '#2196F3' }}>c={((cu ** 2 + cm ** 2) ** 0.5).toFixed(1)}</text>
        {/* w — relative velocity (green) */}
        <line x1={cx + uL / 2} y1={cy} x2={cx - uL / 2 + cuL} y2={cy - cmL} stroke="#4CAF50" strokeWidth={2} markerEnd="url(#aG)" />
        <text x={cx + (cuL - uL) / 2 + 10} y={cy - cmL / 2} fontSize={10} style={{ fill: '#4CAF50' }}>w={(((u - cu) ** 2 + cm ** 2) ** 0.5).toFixed(1)}</text>
        {/* cm dashed vertical */}
        <line x1={cx - uL / 2 + cuL} y1={cy} x2={cx - uL / 2 + cuL} y2={cy - cmL} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3,3" />
        <text x={cx - uL / 2 + cuL + 5} y={cy - cmL / 2} fontSize={9} style={{ fill: 'rgba(255,255,255,0.3)' }}>cm={cm.toFixed(1)}</text>
      </g>
    )
  }

  const flowRatio = hasAnimation && animIdx != null ? curveData![animIdx].flow_ratio : 1.0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: 0 }}>{t.velocityTriangles}</h3>
        {hasAnimation && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Q/Qd = {flowRatio.toFixed(2)}
            </span>
            <input
              type="range" min={0} max={(curveData?.length ?? 1) - 1}
              value={animIdx ?? Math.floor((curveData?.length ?? 2) / 2)}
              onChange={e => { setPlaying(false); setAnimIdx(Number(e.target.value)) }}
              style={{ width: 100, accentColor: 'var(--accent)' }}
            />
            <button
              onClick={() => { setAnimIdx(0); setPlaying(p => !p) }}
              style={{ background: playing ? 'rgba(0,160,223,0.2)' : 'none', border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 10px', fontSize: 11 }}
            >
              {playing ? '⏸' : '▶'} Animar
            </button>
          </div>
        )}
      </div>

      <svg width={W} height={H} style={{ background: 'var(--bg-surface)', borderRadius: 6, display: 'block' }}>
        <defs>
          <marker id="aR" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#e74c3c" /></marker>
          <marker id="aB" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#2196F3" /></marker>
          <marker id="aG" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#4CAF50" /></marker>
        </defs>
        {draw(160, H - 40, inlet.u, inlet.cm, inlet.cu, t.inlet)}
        {draw(480, H - 40, outlet.u, outlet.cm, outlet.cu, t.outlet)}
        {animIdx != null && hasAnimation && (
          <text x={W / 2} y={20} textAnchor="middle" style={{ fill: 'var(--text-muted)', fontSize: 11 }}>
            Q/Qd = {flowRatio.toFixed(2)} · H = {curveData![animIdx].euler_head?.toFixed(1)} m
          </text>
        )}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, fontSize: 13 }}>
        <div className="card" style={{ background: 'rgba(33,150,243,0.08)' }}>
          <b>{t.inlet}</b>
          <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', color: 'var(--text-secondary)' }}>
            <span>u1 = {inlet.u.toFixed(1)} m/s</span><span>cm1 = {inlet.cm.toFixed(1)} m/s</span>
            <span>w1 = {(((inlet.u - inlet.cu) ** 2 + inlet.cm ** 2) ** 0.5).toFixed(1)} m/s</span><span>c1 = {inlet.c?.toFixed(1) ?? '—'} m/s</span>
            <span>β1 = {inlet.beta.toFixed(1)}°</span><span>α1 = {inlet.alpha?.toFixed(1) ?? '—'}°</span>
          </div>
        </div>
        <div className="card" style={{ background: 'rgba(76,175,80,0.08)' }}>
          <b>{t.outlet}</b>
          <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', color: 'var(--text-secondary)' }}>
            <span>u2 = {outlet.u.toFixed(1)} m/s</span><span>cm2 = {outlet.cm.toFixed(1)} m/s</span>
            <span>w2 = {(((outlet.u - outlet.cu) ** 2 + outlet.cm ** 2) ** 0.5).toFixed(1)} m/s</span><span>c2 = {outlet.c?.toFixed(1) ?? '—'} m/s</span>
            <span>β2 = {outlet.beta.toFixed(1)}°</span><span>α2 = {outlet.alpha?.toFixed(1) ?? '—'}°</span>
          </div>
        </div>
      </div>
      {euler && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          {t.eulerHead}: <b style={{ color: 'var(--text-primary)' }}>{Number(euler).toFixed(1)} m</b>
        </div>
      )}
    </div>
  )
}
