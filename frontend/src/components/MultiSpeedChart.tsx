import React, { useEffect, useState } from 'react'

interface Props {
  flowRate: number  // m³/h
  head: number      // m
  rpm: number
}

interface CurveFamily {
  rpm: number
  speed_factor: number
  points: { flow_m3h: number; head: number; efficiency?: number }[]
}

const SPEED_FACTORS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2]
// Blue-to-red gradient matching speed from low to high
const COLORS = ['#1565c0', '#1976d2', '#42a5f5', '#81d4fa', '#ffcc02', '#ef5350']

export default function MultiSpeedChart({ flowRate, head, rpm }: Props) {
  const [families, setFamilies] = useState<CurveFamily[]>([])
  const [loadingCurves, setLoadingCurves] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!flowRate || !head || !rpm) return
    setLoadingCurves(true)
    setError(null)
    const params = new URLSearchParams({
      flow_rate: String(flowRate / 3600),
      head: String(head),
      rpm: String(rpm),
      speed_factors: SPEED_FACTORS.join(','),
    })
    fetch(`/api/v1/sizing/multi_speed?${params}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => setFamilies(d.families || []))
      .catch(e => setError(e.message))
      .finally(() => setLoadingCurves(false))
  }, [flowRate, head, rpm])

  const W = 560, H = 280
  const pad = { l: 50, r: 24, t: 20, b: 42 }
  const iW = W - pad.l - pad.r
  const iH = H - pad.t - pad.b

  const allQ = families.flatMap(f => f.points?.map(p => p.flow_m3h) ?? [])
  const allH = families.flatMap(f => f.points?.map(p => p.head) ?? [])
  const qMax = Math.max(...allQ, flowRate * 1.6) * 1.05
  const hMax = Math.max(...allH, head * 1.6) * 1.05

  const toX = (q: number) => pad.l + (q / qMax) * iW
  const toY = (h: number) => pad.t + (1 - h / hMax) * iH

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderRadius: 8,
    padding: 20,
    border: '1px solid var(--border-primary)',
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 15 }}>
        Família de Curvas — Variação de Velocidade
      </h3>

      {loadingCurves ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Calculando curvas...</div>
      ) : error ? (
        <div style={{ color: '#ef9a9a', fontSize: 13 }}>Erro ao buscar curvas: {error}</div>
      ) : (
        <svg
          width={W} height={H}
          style={{ background: 'var(--bg-primary)', borderRadius: 6, cursor: 'crosshair', display: 'block' }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Vertical grid + Q labels */}
          {[0.25, 0.5, 0.75, 1].map(v => (
            <g key={v}>
              <line
                x1={toX(qMax * v)} y1={pad.t}
                x2={toX(qMax * v)} y2={pad.t + iH}
                stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5}
              />
              <text x={toX(qMax * v)} y={H - 24} fill="var(--text-muted)" fontSize={9} textAnchor="middle">
                {(qMax * v).toFixed(0)}
              </text>
            </g>
          ))}
          {/* Horizontal grid + H labels */}
          {[0.25, 0.5, 0.75, 1].map(v => (
            <g key={v}>
              <line
                x1={pad.l} y1={toY(hMax * v)}
                x2={pad.l + iW} y2={toY(hMax * v)}
                stroke="var(--border-primary)" strokeDasharray="3,3" strokeWidth={0.5}
              />
              <text x={pad.l - 5} y={toY(hMax * v) + 4} fill="var(--text-muted)" fontSize={9} textAnchor="end">
                {(hMax * v).toFixed(0)}
              </text>
            </g>
          ))}
          {/* Axes */}
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + iH} stroke="var(--text-muted)" strokeWidth={1} />
          <line x1={pad.l} y1={pad.t + iH} x2={pad.l + iW} y2={pad.t + iH} stroke="var(--text-muted)" strokeWidth={1} />

          {/* Speed family curves */}
          {families.map((fam, fi) => {
            const pts = fam.points ?? []
            if (!pts.length) return null
            const path = pts.map((p, i) =>
              `${i === 0 ? 'M' : 'L'} ${toX(p.flow_m3h).toFixed(1)} ${toY(p.head).toFixed(1)}`
            ).join(' ')
            const color = COLORS[fi % COLORS.length]
            const isDesign = fam.speed_factor === 1.0
            const lastPt = pts[pts.length - 1]
            return (
              <g key={fi}>
                <path
                  d={path}
                  stroke={color}
                  strokeWidth={isDesign ? 2.5 : 1.5}
                  fill="none"
                  onMouseMove={e => {
                    const svgEl = (e.target as SVGPathElement).ownerSVGElement
                    if (!svgEl) return
                    const rect = svgEl.getBoundingClientRect()
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      label: `${fam.rpm?.toFixed(0)} rpm`,
                    })
                  }}
                />
                <text
                  x={toX(lastPt.flow_m3h) + 4}
                  y={toY(lastPt.head) + 3}
                  fill={color} fontSize={9}
                >
                  {fam.rpm?.toFixed(0)}
                </text>
              </g>
            )
          })}

          {/* Design point marker */}
          <circle cx={toX(flowRate)} cy={toY(head)} r={5} fill="var(--accent)" stroke="#fff" strokeWidth={1.5} />
          <circle cx={toX(flowRate)} cy={toY(head)} r={9} fill="none" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3,2" />

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect
                x={tooltip.x + 8} y={tooltip.y - 16}
                width={86} height={20}
                fill="var(--bg-card)" stroke="var(--border-primary)" rx={3}
              />
              <text x={tooltip.x + 12} y={tooltip.y - 2} fill="var(--text-primary)" fontSize={10}>
                {tooltip.label}
              </text>
            </g>
          )}

          {/* Axis labels */}
          <text
            x={pad.l + iW / 2} y={H - 6}
            fill="var(--text-secondary)" fontSize={10} textAnchor="middle"
          >
            Vazão [m³/h]
          </text>
          <text
            x={12} y={pad.t + iH / 2}
            fill="var(--text-secondary)" fontSize={10} textAnchor="middle"
            transform={`rotate(-90, 12, ${pad.t + iH / 2})`}
          >
            Altura [m]
          </text>

          {/* Legend: design point label */}
          <circle cx={pad.l + 8} cy={pad.t + 8} r={4} fill="var(--accent)" />
          <text x={pad.l + 16} y={pad.t + 12} fill="var(--accent)" fontSize={9}>Ponto de projeto</text>
        </svg>
      )}

      {!loadingCurves && !error && families.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          Nenhuma curva disponível. Execute o dimensionamento primeiro.
        </div>
      )}
    </div>
  )
}
