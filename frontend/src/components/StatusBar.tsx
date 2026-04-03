import React from 'react'
import type { SizingResult } from '../App'

interface Props {
  sizing: SizingResult | null
  opPoint?: { flowRate: number; head: number; rpm: number }
  savedId?: string | null
}

interface Pill {
  label: string
  value: string
}

export default function StatusBar({ sizing, opPoint, savedId }: Props) {
  const pills: Pill[] = sizing
    ? [
        { label: 'Nq', value: sizing.specific_speed_nq.toFixed(1) },
        { label: '\u03B7', value: `${(sizing.estimated_efficiency * 100).toFixed(1)}%` },
        { label: 'D2', value: `${(sizing.impeller_d2 * 1000).toFixed(0)}mm` },
        { label: 'NPSHr', value: `${sizing.estimated_npsh_r.toFixed(1)}m` },
        { label: `Z=${sizing.blade_count}`, value: 'p\u00E1s' },
        { label: 'P', value: `${(sizing.estimated_power / 1000).toFixed(1)}kW` },
      ]
    : []

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 32,
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      zIndex: 900,
      fontFamily: 'var(--font-family)',
      fontSize: 11,
    }}>
      {/* Left: metrics */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {pills.length > 0 ? (
          pills.map((p, i) => (
            <span key={i} style={{
              background: 'var(--bg-surface)',
              borderRadius: 4,
              padding: '2px 8px',
              display: 'inline-flex',
              gap: 4,
              alignItems: 'center',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{p.label}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{p.value}</span>
            </span>
          ))
        ) : (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Aguardando dimensionamento...
          </span>
        )}
      </div>

      {/* Right: save indicator + operating point */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {opPoint && (
          <span style={{ color: 'var(--text-muted)' }}>
            Q={opPoint.flowRate} m\u00B3/h{'  '}H={opPoint.head}m{'  '}n={opPoint.rpm}rpm
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: savedId ? 'var(--accent-success)' : '#666',
            display: 'inline-block',
          }} />
          <span style={{ color: savedId ? 'var(--accent-success)' : 'var(--text-muted)' }}>
            {savedId ? 'Salvo' : 'N\u00E3o salvo'}
          </span>
        </span>
      </div>
    </div>
  )
}
