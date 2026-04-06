import React from 'react'

interface RadarDatum {
  label: string
  value: number
  min: number
  max: number
  higherBetter: boolean
}

interface Props {
  data: RadarDatum[]
  size?: number
}

export default function RadarChart({ data, size = 160 }: Props) {
  const cx = size / 2, cy = size / 2, r = size * 0.38
  const n = data.length

  const normalize = (d: RadarDatum) => {
    const raw = (d.value - d.min) / (d.max - d.min)
    return d.higherBetter ? Math.min(1, Math.max(0, raw)) : Math.min(1, Math.max(0, 1 - raw))
  }

  const points = data.map((d, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const val = normalize(d)
    return {
      x: cx + Math.cos(angle) * r * val,
      y: cy + Math.sin(angle) * r * val,
      lx: cx + Math.cos(angle) * (r + 18),
      ly: cy + Math.sin(angle) * (r + 18),
      label: d.label,
    }
  })

  const polygon = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg width={size} height={size}>
      {/* Grid circles */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <circle key={f} cx={cx} cy={cy} r={r * f} fill="none" stroke="var(--border-subtle, #333)" strokeWidth="0.5" />
      ))}
      {/* Axis lines */}
      {data.map((_, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r}
          stroke="var(--border-primary, #444)" strokeWidth="0.5" />
      })}
      {/* Data polygon */}
      <polygon points={polygon} fill="rgba(0,160,223,0.15)" stroke="var(--accent, #00a0df)" strokeWidth="1.5" />
      {/* Data points */}
      {points.map((p, i) => (
        <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={2.5} fill="var(--accent, #00a0df)" />
      ))}
      {/* Labels */}
      {points.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-muted, #999)" fontSize="9" fontFamily="var(--font-family, sans-serif)">
          {p.label}
        </text>
      ))}
    </svg>
  )
}
