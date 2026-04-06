import React, { useState, useEffect } from 'react'
import type { SizingResult } from '../App'
import EngineeringTooltip from './EngineeringTooltip'
import DeltaIndicator from './DeltaIndicator'
import AnimatedNumber from './AnimatedNumber'
import { warningCounts } from './SmartWarnings'
import { useUnits, type UnitSystem } from '../hooks/useUnits'
import ProgressBadge from './ProgressBadge'

interface Props {
  sizing: SizingResult | null
  previousSizing?: SizingResult | null
  opPoint?: { flowRate: number; head: number; rpm: number }
  savedId?: string | null
  onShortcutsHelp?: () => void
  onTimeline?: () => void
  sidebarCollapsed?: boolean
}

interface Pill {
  label: string
  value: string
  term?: string
  delta?: { current: number; previous: number | null; format: 'pct' | 'abs' | 'mm'; higherIsBetter?: boolean }
  animValue?: number
  animFormat?: (v: number) => string
}

export default function StatusBar({ sizing, previousSizing, opPoint, savedId, onShortcutsHelp, onTimeline, sidebarCollapsed }: Props) {
  const { system: unitSystem, setSystem: setUnitSystem } = useUnits()
  const [fontScale, setFontScale] = useState(() => parseFloat(localStorage.getItem('hpe_font_scale') || '1'))
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 14}px`
    localStorage.setItem('hpe_font_scale', String(fontScale))
  }, [fontScale])

  const tinyBtn: React.CSSProperties = {
    fontSize: 10, padding: '1px 5px', borderRadius: 3,
    border: '1px solid var(--border-primary)', background: 'var(--bg-surface)',
    color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600,
    fontFamily: 'var(--font-family)', lineHeight: '16px',
  }

  const prev = previousSizing || null
  const pills: Pill[] = sizing
    ? [
        { label: 'Nq', value: sizing.specific_speed_nq.toFixed(1), term: 'Nq',
          animValue: sizing.specific_speed_nq, animFormat: (v: number) => v.toFixed(1),
          delta: prev ? { current: sizing.specific_speed_nq, previous: prev.specific_speed_nq, format: 'abs' } : undefined },
        { label: '\u03B7', value: `${(sizing.estimated_efficiency * 100).toFixed(1)}%`, term: '\u03B7',
          animValue: sizing.estimated_efficiency * 100, animFormat: (v: number) => `${v.toFixed(1)}%`,
          delta: prev ? { current: sizing.estimated_efficiency, previous: prev.estimated_efficiency, format: 'pct', higherIsBetter: true } : undefined },
        { label: 'D2', value: `${(sizing.impeller_d2 * 1000).toFixed(0)}mm`, term: 'D2',
          animValue: sizing.impeller_d2 * 1000, animFormat: (v: number) => `${v.toFixed(0)}mm`,
          delta: prev ? { current: sizing.impeller_d2 * 1000, previous: prev.impeller_d2 * 1000, format: 'mm' } : undefined },
        { label: 'NPSHr', value: `${sizing.estimated_npsh_r.toFixed(1)}m`, term: 'NPSHr',
          animValue: sizing.estimated_npsh_r, animFormat: (v: number) => `${v.toFixed(1)}m`,
          delta: prev ? { current: sizing.estimated_npsh_r, previous: prev.estimated_npsh_r, format: 'pct', higherIsBetter: false } : undefined },
        { label: `Z=${sizing.blade_count}`, value: 'p\u00E1s' },
        { label: 'P', value: `${(sizing.estimated_power / 1000).toFixed(1)}kW`, term: 'P',
          animValue: sizing.estimated_power / 1000, animFormat: (v: number) => `${v.toFixed(1)}kW`,
          delta: prev ? { current: sizing.estimated_power / 1000, previous: prev.estimated_power / 1000, format: 'pct', higherIsBetter: false } : undefined },
      ]
    : []

  return (
    <div className={`status-bar${sidebarCollapsed ? ' sb-collapsed' : ''}`} style={{
      position: 'fixed',
      bottom: 0,
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
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                {p.animValue != null && p.animFormat
                  ? <AnimatedNumber value={p.animValue} format={p.animFormat} />
                  : p.value}
              </span>
              {p.delta && <DeltaIndicator current={p.delta.current} previous={p.delta.previous} format={p.delta.format} higherIsBetter={p.delta.higherIsBetter} />}
            </span>
          ))
        ) : (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Aguardando dimensionamento...
          </span>
        )}
      </div>

      {/* Right: progress badge + warnings badge + save indicator + operating point */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ProgressBadge />
        {sizing && sizing.warnings && sizing.warnings.length > 0 && (() => {
          const counts = warningCounts(sizing.warnings)
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {counts.critical > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700,
                }}>{counts.critical} crit</span>
              )}
              {counts.warning > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700,
                }}>{counts.warning} alrt</span>
              )}
              {counts.info > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 8,
                  background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 700,
                }}>{counts.info} info</span>
              )}
            </span>
          )
        })()}
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
        <select
          value={unitSystem}
          onChange={e => setUnitSystem(e.target.value as UnitSystem)}
          title="Sistema de unidades"
          style={{
            fontSize: 10, padding: '1px 4px', borderRadius: 3,
            border: '1px solid var(--border-primary)', background: 'var(--bg-surface)',
            color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-family)',
          }}
        >
          <option value="SI">SI</option>
          <option value="practical">Pratico</option>
          <option value="imperial">Imperial</option>
        </select>
        <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
          <button onClick={() => setFontScale(s => Math.max(0.8, +(s - 0.1).toFixed(1)))} style={tinyBtn} title="Diminuir fonte">A-</button>
          <button onClick={() => setFontScale(s => Math.min(1.4, +(s + 0.1).toFixed(1)))} style={tinyBtn} title="Aumentar fonte">A+</button>
        </span>
        {onTimeline && (
          <button
            onClick={onTimeline}
            title="Historico de acoes"
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        )}
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
