import React from 'react'
import type { SizingResult } from '../App'
import EngineeringTooltip from './EngineeringTooltip'
import DeltaIndicator from './DeltaIndicator'

interface Props {
  sizing: SizingResult | null
  previousSizing?: SizingResult | null
  opPoint?: { flowRate: number; head: number; rpm: number }
  savedId?: string | null
  onShortcutsHelp?: () => void
}

interface Pill {
  label: string
  value: string
  term?: string
  delta?: { current: number; previous: number | null; format: 'pct' | 'abs' | 'mm'; higherIsBetter?: boolean }
}

export default function StatusBar({ sizing, previousSizing, opPoint, savedId, onShortcutsHelp }: Props) {
  const prev = previousSizing || null
  const pills: Pill[] = sizing
    ? [
        { label: 'Nq', value: sizing.specific_speed_nq.toFixed(1), term: 'Nq',
          delta: prev ? { current: sizing.specific_speed_nq, previous: prev.specific_speed_nq, format: 'abs' } : undefined },
        { label: '\u03B7', value: `${(sizing.estimated_efficiency * 100).toFixed(1)}%`, term: '\u03B7',
          delta: prev ? { current: sizing.estimated_efficiency, previous: prev.estimated_efficiency, format: 'pct', higherIsBetter: true } : undefined },
        { label: 'D2', value: `${(sizing.impeller_d2 * 1000).toFixed(0)}mm`, term: 'D2',
          delta: prev ? { current: sizing.impeller_d2 * 1000, previous: prev.impeller_d2 * 1000, format: 'mm' } : undefined },
        { label: 'NPSHr', value: `${sizing.estimated_npsh_r.toFixed(1)}m`, term: 'NPSHr',
          delta: prev ? { current: sizing.estimated_npsh_r, previous: prev.estimated_npsh_r, format: 'pct', higherIsBetter: false } : undefined },
        { label: `Z=${sizing.blade_count}`, value: 'p\u00E1s' },
        { label: 'P', value: `${(sizing.estimated_power / 1000).toFixed(1)}kW`, term: 'P',
          delta: prev ? { current: sizing.estimated_power / 1000, previous: prev.estimated_power / 1000, format: 'pct', higherIsBetter: false } : undefined },
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
              <span style={{ color: 'var(--text-muted)' }}>{p.term ? <EngineeringTooltip term={p.term}>{p.label}</EngineeringTooltip> : p.label}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{p.value}</span>
              {p.delta && <DeltaIndicator current={p.delta.current} previous={p.delta.previous} format={p.delta.format} higherIsBetter={p.delta.higherIsBetter} />}
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
        {onShortcutsHelp && (
          <button
            onClick={onShortcutsHelp}
            title="Atalhos de teclado"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              width: 20, height: 20,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-family)',
              padding: 0,
            }}
          >
            ?
          </button>
        )}
      </div>
    </div>
  )
}
