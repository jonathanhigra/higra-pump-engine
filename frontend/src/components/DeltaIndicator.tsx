import React from 'react'

interface Props {
  current: number
  previous: number | null
  unit?: string
  format?: 'pct' | 'abs' | 'mm'
  higherIsBetter?: boolean
}

export default function DeltaIndicator({ current, previous, unit, format = 'abs', higherIsBetter }: Props) {
  if (previous == null || previous === 0) return null

  const diff = current - previous
  const pctChange = (diff / Math.abs(previous)) * 100

  if (Math.abs(pctChange) < 0.05) {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4, display: 'inline' }}>
        = 0%
      </span>
    )
  }

  const isPositive = diff > 0
  let color: string
  if (higherIsBetter === undefined) {
    color = 'var(--text-muted)'
  } else if (higherIsBetter) {
    color = isPositive ? '#4caf50' : '#ef4444'
  } else {
    color = isPositive ? '#ef4444' : '#4caf50'
  }

  const arrow = isPositive ? '\u2191' : '\u2193'
  const sign = isPositive ? '+' : ''

  let displayValue: string
  if (format === 'pct') {
    displayValue = `${sign}${pctChange.toFixed(1)}%`
  } else if (format === 'mm') {
    displayValue = `${sign}${diff.toFixed(0)}mm`
  } else {
    displayValue = `${sign}${diff.toFixed(2)}${unit ? ' ' + unit : ''}`
  }

  return (
    <span style={{ fontSize: 11, color, marginLeft: 4, display: 'inline', fontWeight: 500 }}>
      {arrow} {displayValue}
    </span>
  )
}
