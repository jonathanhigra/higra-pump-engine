import React, { useState } from 'react'
import t from '../i18n/pt-br'
import MeridionalView from '../components/MeridionalView'

interface Props {
  sizing: {
    specific_speed_nq: number; impeller_type: string
    impeller_d2: number; impeller_d1: number; impeller_b2: number
    blade_count: number; beta1: number; beta2: number
    estimated_efficiency: number; estimated_power: number
    estimated_npsh_r: number; warnings: string[]
    meridional_profile?: Record<string, any>
    uncertainty?: Record<string, number>
  }
}

export default function ResultsView({ sizing: s }: Props) {
  const [showMeridional, setShowMeridional] = useState(false)
  const u = s.uncertainty

  const row = (label: string, value: string, uncertaintyPct?: number) => (
    <tr key={label}>
      <td style={{ padding: '5px 12px 5px 0', color: 'var(--text-muted)', fontSize: 13 }}>{label}</td>
      <td style={{ padding: '5px 0', fontWeight: 500, color: 'var(--text-primary)' }}>
        {value}
        {uncertaintyPct != null && (
          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-warning)' }}>
            ±{uncertaintyPct.toFixed(0)}%
          </span>
        )}
      </td>
    </tr>
  )

  const mp = s.meridional_profile
  const hasMeridional = mp && mp.d1 && mp.d2

  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: 0 }}>{t.sizingResults}</h3>
        {hasMeridional && (
          <button
            onClick={() => setShowMeridional(s => !s)}
            style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 10px', fontSize: 11 }}
          >
            {showMeridional ? 'Ocultar' : 'Canal Meridional'}
          </button>
        )}
      </div>

      {/* Uncertainty legend */}
      {u && (
        <div style={{ marginBottom: 10, padding: '6px 10px', background: 'rgba(255,213,79,0.06)', borderRadius: 6, border: '1px solid rgba(255,213,79,0.15)', fontSize: 11, color: 'var(--text-muted)' }}>
          ± Incerteza das correlações: D2 ±{u.d2_pct?.toFixed(0)}% · η ±{u.eta_pct?.toFixed(0)}% · NPSHr ±{u.npsh_pct?.toFixed(0)}% · b2 ±{u.b2_pct?.toFixed(0)}%
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{t.specificSpeed}</h4>
          <table><tbody>
            {row('Nq', s.specific_speed_nq.toFixed(1))}
            {row(t.type, s.impeller_type)}
          </tbody></table>
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{t.impeller}</h4>
          <table><tbody>
            {row('D2', `${(s.impeller_d2 * 1000).toFixed(1)} mm`, u?.d2_pct)}
            {row('D1', `${(s.impeller_d1 * 1000).toFixed(1)} mm`)}
            {row('b2', `${(s.impeller_b2 * 1000).toFixed(1)} mm`, u?.b2_pct)}
            {row(t.blades, `${s.blade_count}`)}
            {row('β1', `${s.beta1.toFixed(1)}°`, u?.beta2_pct)}
            {row('β2', `${s.beta2.toFixed(1)}°`, u?.beta2_pct)}
          </tbody></table>
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{t.performance}</h4>
          <table><tbody>
            {row(t.efficiency, `${(s.estimated_efficiency * 100).toFixed(1)}%`, u?.eta_pct)}
            {row(t.power, `${(s.estimated_power / 1000).toFixed(1)} kW`)}
            {row('NPSHr', `${s.estimated_npsh_r.toFixed(1)} m`, u?.npsh_pct)}
          </tbody></table>
        </div>
      </div>

      {s.warnings.length > 0 && (
        <div style={{ marginTop: 15, padding: 12, background: 'rgba(255,213,79,0.12)', borderRadius: 6, border: '1px solid rgba(255,213,79,0.3)' }}>
          <strong style={{ fontSize: 13, color: 'var(--accent-warning)' }}>{t.warnings}:</strong>
          {s.warnings.map((w, i) => <p key={i} style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{w}</p>)}
        </div>
      )}

      {/* Meridional channel view (#20) */}
      {showMeridional && hasMeridional && (
        <div style={{ marginTop: 16 }}>
          <MeridionalView
            meridional={{
              d1: mp.d1, d1_hub: mp.d1_hub, d2: mp.d2,
              b1: mp.b1, b2: mp.b2,
            }}
            blade_count={s.blade_count}
            beta1={s.beta1}
            beta2={s.beta2}
          />
        </div>
      )}
    </div>
  )
}
