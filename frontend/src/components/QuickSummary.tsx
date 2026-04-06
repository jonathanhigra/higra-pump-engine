import React from 'react'
import type { SizingResult, CurvePoint } from '../App'

interface Props {
  sizing: SizingResult
  curves: CurvePoint[]
  opPoint: { flowRate: number; head: number; rpm: number }
  onNavigate: (tab: string) => void
}

export default function QuickSummary({ sizing, curves, opPoint, onNavigate }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 900 }}>
      {/* Top left: Key metrics */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 13 }}>Metricas Principais</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Nq', value: sizing.specific_speed_nq.toFixed(1), unit: '' },
            { label: 'n total', value: (sizing.estimated_efficiency * 100).toFixed(1), unit: '%' },
            { label: 'D2', value: (sizing.impeller_d2 * 1000).toFixed(0), unit: 'mm' },
            { label: 'NPSHr', value: sizing.estimated_npsh_r.toFixed(1), unit: 'm' },
            { label: 'Potencia', value: (sizing.estimated_power / 1000).toFixed(1), unit: 'kW' },
            { label: 'Z pas', value: String(sizing.blade_count), unit: '' },
          ].map(m => (
            <div key={m.label} style={{ padding: 8, background: 'var(--bg-surface)', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{m.value}<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.unit}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Top right: Quick navigation cards */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 13 }}>Explorar</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Geometria 3D', tab: '3d', icon: 'M21 16V8l-7-4-7 4v8l7 4 7-4z' },
            { label: 'Curvas H-Q', tab: 'curves', icon: 'M3 12h4l3-9 4 18 3-9h4' },
            { label: 'Analise Perdas', tab: 'losses', icon: 'M12 20V10M18 20V4M6 20v-4' },
            { label: 'Otimizar', tab: 'optimize', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
          ].map(c => (
            <button key={c.tab} onClick={() => onNavigate(c.tab)} style={{
              padding: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
              borderRadius: 6, cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.15s',
              fontFamily: 'var(--font-family)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-primary)')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 4 }}>
                <path d={c.icon} />
              </svg>
              <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>{c.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom: Warnings */}
      {sizing.warnings?.length > 0 && (
        <div className="card" style={{ padding: 16, gridColumn: '1 / -1' }}>
          <h4 style={{ color: '#facc15', margin: '0 0 8px', fontSize: 13 }}>Avisos ({sizing.warnings.length})</h4>
          {sizing.warnings.slice(0, 3).map((w: string, i: number) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0' }}>* {w}</div>
          ))}
        </div>
      )}

      {/* Bottom: Operating Point */}
      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
        Q={opPoint.flowRate} m3/h -- H={opPoint.head}m -- n={opPoint.rpm}rpm -- {sizing.blade_count} pas --
        {sizing.meridional_profile?.impeller_type || 'radial'}
      </div>
    </div>
  )
}
