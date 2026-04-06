import React, { useState, useEffect } from 'react'

const LEVELS = [
  { min: 0, label: 'Iniciante', symbol: '*' },
  { min: 3, label: 'Explorador', symbol: '**' },
  { min: 8, label: 'Projetista', symbol: '***' },
  { min: 15, label: 'Especialista', symbol: '****' },
  { min: 30, label: 'Mestre', symbol: '*****' },
]

export default function ProgressBadge() {
  const [count, setCount] = useState(() => parseInt(localStorage.getItem('hpe_sizing_count') || '0'))

  useEffect(() => { localStorage.setItem('hpe_sizing_count', String(count)) }, [count])

  const level = [...LEVELS].reverse().find(l => count >= l.min) || LEVELS[0]
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1]

  return (
    <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}
      title={`${count} dimensionamentos realizados`}>
      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{level.label}</span>
      {nextLevel && <span>({count}/{nextLevel.min})</span>}
    </span>
  )
}

export function incrementSizingCount() {
  const c = parseInt(localStorage.getItem('hpe_sizing_count') || '0') + 1
  localStorage.setItem('hpe_sizing_count', String(c))
  return c
}
