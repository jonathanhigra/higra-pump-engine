import React from 'react'

interface CurvePoint {
  flow_rate: number
  head: number
  efficiency: number
  power: number
  npsh_required: number
}

interface Props {
  points: CurvePoint[]
}

export default function CurvesChart({ points }: Props) {
  if (points.length === 0) return null

  // Simple SVG chart (no external dependency needed for MVP)
  const width = 700
  const height = 300
  const padding = { top: 20, right: 80, bottom: 40, left: 60 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const qValues = points.map(p => p.flow_rate * 3600)  // m3/h
  const hValues = points.map(p => p.head)
  const eValues = points.map(p => p.efficiency * 100)

  const qMin = Math.min(...qValues)
  const qMax = Math.max(...qValues)
  const hMax = Math.max(...hValues) * 1.1
  const eMax = 100

  const scaleX = (v: number) => padding.left + ((v - qMin) / (qMax - qMin)) * chartW
  const scaleH = (v: number) => padding.top + chartH - (v / hMax) * chartH
  const scaleE = (v: number) => padding.top + chartH - (v / eMax) * chartH

  const hLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(qValues[i])},${scaleH(p.head)}`).join(' ')
  const eLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(qValues[i])},${scaleE(p.efficiency * 100)}`).join(' ')

  return (
    <div>
      <h3 style={{ color: '#2E8B57' }}>Performance Curves</h3>
      <svg width={width} height={height} style={{ background: '#fafafa', borderRadius: 4 }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1.0].map(f => (
          <line key={f} x1={padding.left} x2={width - padding.right}
            y1={padding.top + chartH * (1 - f)} y2={padding.top + chartH * (1 - f)}
            stroke="#eee" />
        ))}

        {/* H-Q curve (blue) */}
        <path d={hLine} fill="none" stroke="#2196F3" strokeWidth={2} />

        {/* Eta-Q curve (green) */}
        <path d={eLine} fill="none" stroke="#4CAF50" strokeWidth={2} />

        {/* Labels */}
        <text x={width - padding.right + 5} y={scaleH(hValues[hValues.length - 1])} fontSize={11} fill="#2196F3">H [m]</text>
        <text x={width - padding.right + 5} y={scaleE(eValues[eValues.length - 1])} fontSize={11} fill="#4CAF50">eta [%]</text>

        {/* X axis label */}
        <text x={width / 2} y={height - 5} fontSize={12} textAnchor="middle" fill="#666">Q [m3/h]</text>

        {/* X axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(f => {
          const v = qMin + f * (qMax - qMin)
          return <text key={f} x={scaleX(v)} y={height - 20} fontSize={10} textAnchor="middle" fill="#888">{v.toFixed(0)}</text>
        })}
      </svg>
    </div>
  )
}
