import React from 'react'
import type { VersionEntry } from '../services/api'

interface Props {
  versions: VersionEntry[]
}

export default function EvolutionSparkline({ versions }: Props) {
  if (versions.length < 2) return null

  const data = versions.slice(0, 10).reverse() // oldest to newest
  const etas = data.map(v => v.eta)
  const min = Math.min(...etas) * 0.95
  const max = Math.max(...etas) * 1.05
  const range = max - min || 1
  const w = 80
  const h = 20

  const points = etas.map((e, i) => {
    const x = (i / (etas.length - 1)) * w
    const y = h - ((e - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  const lastY = h - ((etas[etas.length - 1] - min) / range) * h

  return (
    <svg width={w} height={h} style={{ verticalAlign: 'middle' }}>
      <title>{`Efficiency trend: ${(etas[etas.length - 1] * 100).toFixed(1)}%`}</title>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx={w} cy={lastY} r="2" fill="var(--accent)" />
    </svg>
  )
}
