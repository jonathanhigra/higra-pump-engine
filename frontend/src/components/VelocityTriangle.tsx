import React from 'react'

interface Props {
  triangles: Record<string, any>
}

export default function VelocityTriangle({ triangles }: Props) {
  if (!triangles?.inlet || !triangles?.outlet) return <p>No velocity data</p>

  const inlet = triangles.inlet
  const outlet = triangles.outlet
  const euler = triangles.euler_head

  const W = 640
  const H = 260

  const drawTriangle = (
    cx: number, cy: number, u: number, cm: number, cu: number, label: string, scale: number,
  ) => {
    const uLen = u * scale
    const cmLen = cm * scale
    const cuLen = cu * scale
    const wuLen = (u - cu) * scale

    return (
      <g>
        <text x={cx} y={cy - cmLen - 15} fontSize={13} fontWeight={600} textAnchor="middle" fill="#333">{label}</text>

        {/* u vector (peripheral) */}
        <line x1={cx - uLen / 2} y1={cy} x2={cx + uLen / 2} y2={cy} stroke="#e74c3c" strokeWidth={2} markerEnd="url(#arrowR)" />
        <text x={cx} y={cy + 16} fontSize={11} textAnchor="middle" fill="#e74c3c">u = {u.toFixed(1)} m/s</text>

        {/* c vector (absolute) */}
        <line x1={cx - uLen / 2} y1={cy} x2={cx - uLen / 2 + cuLen} y2={cy - cmLen} stroke="#2196F3" strokeWidth={2} markerEnd="url(#arrowB)" />
        <text x={cx - uLen / 2 + cuLen / 2 - 15} y={cy - cmLen / 2} fontSize={10} fill="#2196F3">c</text>

        {/* w vector (relative) */}
        <line x1={cx + uLen / 2} y1={cy} x2={cx - uLen / 2 + cuLen} y2={cy - cmLen} stroke="#4CAF50" strokeWidth={2} markerEnd="url(#arrowG)" />
        <text x={cx + uLen / 2 - wuLen / 2 + 10} y={cy - cmLen / 2} fontSize={10} fill="#4CAF50">w</text>

        {/* cm dashed */}
        <line x1={cx - uLen / 2 + cuLen} y1={cy} x2={cx - uLen / 2 + cuLen} y2={cy - cmLen} stroke="#999" strokeWidth={1} strokeDasharray="3,3" />
      </g>
    )
  }

  const maxU = Math.max(inlet.u, outlet.u)
  const maxCm = Math.max(inlet.cm, outlet.cm)
  const scale = Math.min(120 / maxU, 120 / maxCm)

  return (
    <div>
      <h3 style={{ color: '#2E8B57', fontSize: 15 }}>Velocity Triangles</h3>

      <svg width={W} height={H} style={{ background: '#fafafa', borderRadius: 6 }}>
        <defs>
          <marker id="arrowR" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#e74c3c" /></marker>
          <marker id="arrowB" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#2196F3" /></marker>
          <marker id="arrowG" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#4CAF50" /></marker>
        </defs>

        {drawTriangle(160, H - 40, inlet.u, inlet.cm, inlet.cu, 'Inlet', scale)}
        {drawTriangle(480, H - 40, outlet.u, outlet.cm, outlet.cu, 'Outlet', scale)}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, fontSize: 13 }}>
        <div style={{ background: '#f0f7ff', padding: 12, borderRadius: 6 }}>
          <b>Inlet</b>
          <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', color: '#555' }}>
            <span>u1 = {inlet.u.toFixed(1)} m/s</span>
            <span>cm1 = {inlet.cm.toFixed(1)} m/s</span>
            <span>w1 = {inlet.w.toFixed(1)} m/s</span>
            <span>c1 = {inlet.c.toFixed(1)} m/s</span>
            <span>beta1 = {inlet.beta.toFixed(1)}°</span>
            <span>alpha1 = {inlet.alpha.toFixed(1)}°</span>
          </div>
        </div>
        <div style={{ background: '#f0fff0', padding: 12, borderRadius: 6 }}>
          <b>Outlet</b>
          <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', color: '#555' }}>
            <span>u2 = {outlet.u.toFixed(1)} m/s</span>
            <span>cm2 = {outlet.cm.toFixed(1)} m/s</span>
            <span>w2 = {outlet.w.toFixed(1)} m/s</span>
            <span>c2 = {outlet.c.toFixed(1)} m/s</span>
            <span>beta2 = {outlet.beta.toFixed(1)}°</span>
            <span>alpha2 = {outlet.alpha.toFixed(1)}°</span>
          </div>
        </div>
      </div>

      {euler && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#555', textAlign: 'center' }}>
          Euler Head: <b>{euler.toFixed(1)} m</b>
        </div>
      )}
    </div>
  )
}
