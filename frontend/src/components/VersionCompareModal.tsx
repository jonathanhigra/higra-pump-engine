import React from 'react'
import type { VersionCompareResult } from '../services/api'

interface Props {
  data: VersionCompareResult
  onClose: () => void
}

interface MetricDef {
  key: string
  label: string
  unit: string
  decimals: number
  /** 'higher' = higher is better, 'lower' = lower is better, 'neutral' = no preference */
  direction: 'higher' | 'lower' | 'neutral'
}

const METRICS: MetricDef[] = [
  { key: 'nq', label: 'Nq', unit: '', decimals: 1, direction: 'neutral' },
  { key: 'eta', label: '\u03B7', unit: '%', decimals: 2, direction: 'higher' },
  { key: 'd2_mm', label: 'D2', unit: 'mm', decimals: 1, direction: 'neutral' },
  { key: 'npsh', label: 'NPSHr', unit: 'm', decimals: 2, direction: 'lower' },
  { key: 'power_kw', label: 'Potência', unit: 'kW', decimals: 2, direction: 'lower' },
  { key: 'blade_count', label: 'Z (pás)', unit: '', decimals: 0, direction: 'neutral' },
  { key: 'beta1', label: '\u03B2\u2081', unit: '\u00B0', decimals: 1, direction: 'neutral' },
  { key: 'beta2', label: '\u03B2\u2082', unit: '\u00B0', decimals: 1, direction: 'neutral' },
]

export default function VersionCompareModal({ data, onClose }: Props) {
  const { a, b, deltas } = data
  const va = a.version
  const vb = b.version

  // Count improvements
  let improvements = 0
  let total = 0
  for (const m of METRICS) {
    if (m.direction === 'neutral') continue
    total++
    const d = deltas[m.key]
    if (!d) continue
    if (m.direction === 'higher' && d.delta > 0) improvements++
    if (m.direction === 'lower' && d.delta < 0) improvements++
  }

  const getDeltaColor = (metric: MetricDef, delta: number): string => {
    if (delta === 0 || metric.direction === 'neutral') return 'var(--text-muted)'
    if (metric.direction === 'higher') return delta > 0 ? '#4caf50' : '#ef5350'
    if (metric.direction === 'lower') return delta < 0 ? '#4caf50' : '#ef5350'
    return 'var(--text-muted)'
  }

  const getArrow = (delta: number): string => {
    if (delta > 0) return '\u2191'
    if (delta < 0) return '\u2193'
    return ''
  }

  const formatOp = (v: any) => {
    const q = v.flow_rate >= 1 ? (v.flow_rate * 3600).toFixed(0) : (v.flow_rate * 3600).toFixed(0)
    return `Q=${q} m\u00B3/h  H=${v.head} m  n=${v.rpm} rpm`
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 900,
          background: 'var(--bg-elevated)',
          borderRadius: 12,
          border: '1px solid var(--border-primary)',
          boxShadow: 'var(--shadow-md)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              V{va.version_number} vs V{vb.version_number}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Column headers: version badges + operating points */}
        <div style={{
          display: 'grid', gridTemplateColumns: '140px 1fr 1fr 180px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 12, color: 'var(--text-muted)', fontWeight: 600,
        }}>
          <div>Metrica</div>
          <div style={{ textAlign: 'center' }}>
            <span style={{
              background: 'var(--accent)', color: '#fff', borderRadius: 4,
              padding: '2px 8px', fontSize: 11, fontWeight: 700,
            }}>V{va.version_number}</span>
            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>
              {formatOp(va)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <span style={{
              background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: 4,
              padding: '2px 8px', fontSize: 11, fontWeight: 700,
              border: '1px solid var(--border-primary)',
            }}>V{vb.version_number}</span>
            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>
              {formatOp(vb)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>Delta</div>
        </div>

        {/* Metric rows */}
        <div style={{ padding: '0 24px' }}>
          {METRICS.map(m => {
            const d = deltas[m.key]
            if (!d) return null
            const color = getDeltaColor(m, d.delta)
            const arrow = getArrow(d.delta)
            return (
              <div key={m.key} style={{
                display: 'grid', gridTemplateColumns: '140px 1fr 1fr 180px',
                padding: '10px 0',
                borderBottom: '1px solid var(--border-subtle)',
                alignItems: 'center',
                fontSize: 13,
              }}>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {m.label} {m.unit && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>[{m.unit}]</span>}
                </div>
                <div style={{ textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {d.a.toFixed(m.decimals)}
                </div>
                <div style={{ textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {d.b.toFixed(m.decimals)}
                </div>
                <div style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color }}>
                  {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(m.decimals)}
                  {' '}({d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%)
                  {' '}{arrow}
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'center',
          fontSize: 13, fontWeight: 600,
          color: improvements > total / 2 ? '#4caf50' : improvements === 0 ? '#ef5350' : 'var(--text-secondary)',
        }}>
          V{vb.version_number} melhor em {improvements} de {total} métricas comparáveis
        </div>
      </div>
    </div>
  )
}
