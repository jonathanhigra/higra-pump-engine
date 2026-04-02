import React, { useState } from 'react'
import MeridionalView from '../components/MeridionalView'

interface Props {
  sizing: any
}

function GaugeArc({ pct, color }: { pct: number; color: string }) {
  const r = 40, cx = 52, cy = 52
  const startAngle = -210, endAngle = 30
  const totalArc = endAngle - startAngle
  const angle = startAngle + totalArc * Math.min(1, Math.max(0, pct / 100))
  const toRad = (d: number) => d * Math.PI / 180
  const arcX = (a: number) => cx + r * Math.cos(toRad(a))
  const arcY = (a: number) => cy + r * Math.sin(toRad(a))

  const describeArc = (start: number, end: number) => {
    const large = end - start > 180 ? 1 : 0
    return `M ${arcX(start)} ${arcY(start)} A ${r} ${r} 0 ${large} 1 ${arcX(end)} ${arcY(end)}`
  }

  return (
    <svg width={104} height={80} viewBox="0 0 104 80">
      <path d={describeArc(startAngle, endAngle)} fill="none" stroke="var(--border-primary)" strokeWidth={7} strokeLinecap="round" />
      <path d={describeArc(startAngle, angle)} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize={18} fontWeight={700}>{pct.toFixed(1)}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill="var(--text-muted)" fontSize={9}>η%</text>
    </svg>
  )
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? '#4caf50' : warn ? '#FFD54F' : '#ef4444'
  return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 5, flexShrink: 0 }} />
  )
}

export default function ResultsView({ sizing: s }: Props) {
  const [section, setSection] = useState<'geo' | 'perf' | 'losses' | null>('geo')
  const [showMeridional, setShowMeridional] = useState(false)

  const u = s.uncertainty || {}
  const mp = s.meridional_profile || {}
  const eta = (s.estimated_efficiency || 0) * 100
  const etaColor = eta >= 80 ? '#4caf50' : eta >= 70 ? '#FFD54F' : '#ef4444'
  const dr = s.diffusion_ratio || 0
  const tipSpeed = s.velocity_triangles?.outlet?.u || 0

  const SectionBtn = ({ id, label }: { id: 'geo' | 'perf' | 'losses'; label: string }) => (
    <button type="button" onClick={() => setSection(section === id ? null : id)}
      style={{
        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        border: `1px solid ${section === id ? 'var(--accent)' : 'var(--border-primary)'}`,
        background: section === id ? 'rgba(0,160,223,0.12)' : 'transparent',
        color: section === id ? 'var(--accent)' : 'var(--text-muted)',
      }}>
      {label}
    </button>
  )

  const row = (label: string, value: string, pct?: number) => (
    <tr key={label}>
      <td style={{ padding: '5px 12px 5px 0', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '5px 0', fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
        {value}
        {pct != null && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--accent-warning)' }}>±{pct.toFixed(0)}%</span>}
      </td>
    </tr>
  )

  return (
    <div>
      {/* Hero strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'D2', value: `${(s.impeller_d2 * 1000).toFixed(0)}`, unit: 'mm', color: 'var(--accent)' },
          { label: 'Nq', value: s.specific_speed_nq.toFixed(0), unit: '—', color: '#a78bfa' },
          { label: 'Potência', value: `${(s.estimated_power / 1000).toFixed(1)}`, unit: 'kW', color: '#34d399' },
        ].map(m => (
          <div key={m.label} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.unit}</div>
          </div>
        ))}
      </div>

      {/* Efficiency gauge + quick status */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, padding: 14 }}>
        <GaugeArc pct={eta} color={etaColor} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>STATUS DO PROJETO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
              <StatusDot ok={dr >= 0.7} warn={dr >= 0.6} />
              <span style={{ color: 'var(--text-secondary)' }}>De Haller: </span>
              <span style={{ marginLeft: 4, fontWeight: 600, color: dr >= 0.7 ? '#4caf50' : dr >= 0.6 ? '#FFD54F' : '#ef4444' }}>
                {dr > 0 ? dr.toFixed(3) : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
              <StatusDot ok={tipSpeed < 35} warn={tipSpeed < 45} />
              <span style={{ color: 'var(--text-secondary)' }}>Vel. periférica u2: </span>
              <span style={{ marginLeft: 4, fontWeight: 600, color: 'var(--text-primary)' }}>{tipSpeed.toFixed(1)} m/s</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
              <StatusDot ok={s.estimated_npsh_r < 5} warn={s.estimated_npsh_r < 10} />
              <span style={{ color: 'var(--text-secondary)' }}>NPSHr: </span>
              <span style={{ marginLeft: 4, fontWeight: 600, color: 'var(--text-primary)' }}>{s.estimated_npsh_r?.toFixed(1)} m</span>
            </div>
            {s.pmin_pa != null && (
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                <StatusDot ok={s.pmin_pa > 10000} warn={s.pmin_pa > 2340} />
                <span style={{ color: 'var(--text-secondary)' }}>Pmin: </span>
                <span style={{ marginLeft: 4, fontWeight: 600, color: 'var(--text-primary)' }}>{(s.pmin_pa / 1000).toFixed(1)} kPa</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <SectionBtn id="geo" label="Geometria" />
        <SectionBtn id="perf" label="Desempenho" />
        <SectionBtn id="losses" label="Perdas" />
        <button type="button" onClick={() => setShowMeridional(v => !v)}
          style={{ marginLeft: 'auto', fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
          {showMeridional ? 'Fechar' : '◻ Meridional'}
        </button>
      </div>

      {section === 'geo' && (
        <div className="card" style={{ marginBottom: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {row('D2 (saída)', `${(s.impeller_d2 * 1000).toFixed(1)} mm`, u.d2_pct)}
            {row('D1 (entrada)', `${(s.impeller_d1 * 1000).toFixed(1)} mm`)}
            {row('b2 (largura)', `${(s.impeller_b2 * 1000).toFixed(1)} mm`, u.b2_pct)}
            {row('Z (pás)', `${s.blade_count}`)}
            {row('β1', `${s.beta1?.toFixed(1)}°`, u.beta2_pct)}
            {row('β2', `${s.beta2?.toFixed(1)}°`, u.beta2_pct)}
            {s.beta1 && s.beta2 && s.impeller_d1 && s.impeller_d2 && (() => {
              const betaMean = (s.beta1 + s.beta2) / 2 * Math.PI / 180
              const wrap = (Math.log(s.impeller_d2 / s.impeller_d1) / Math.tan(betaMean)) * 180 / Math.PI
              return row('Ângulo de embrulho', `${wrap.toFixed(0)}°`)
            })()}
            {s.slip_factor ? row('Fator deslizamento', s.slip_factor.toFixed(4)) : null}
            {s.throat_area ? row('Área de garganta', `${(s.throat_area * 1e4).toFixed(2)} cm²`) : null}
          </tbody></table>
        </div>
      )}

      {section === 'perf' && (
        <div className="card" style={{ marginBottom: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {row('Rendimento total η', `${eta.toFixed(1)}%`, u.eta_pct)}
            {row('Potência', `${(s.estimated_power / 1000).toFixed(2)} kW`)}
            {row('NPSHr', `${s.estimated_npsh_r?.toFixed(2)} m`, u.npsh_pct)}
            {row('Nq', `${s.specific_speed_nq?.toFixed(1)}`)}
            {row('Tipo de rotor', s.impeller_type || '—')}
            {s.diffusion_ratio ? row('Razão de difusão (De Haller)', s.diffusion_ratio.toFixed(3)) : null}
            {s.convergence_iterations ? row('Conv. iterações', `${s.convergence_iterations}`) : null}
          </tbody></table>
        </div>
      )}

      {section === 'losses' && (
        <div className="card" style={{ marginBottom: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {s.profile_loss_total != null ? row('Perda de perfil total', s.profile_loss_total.toFixed(5)) : null}
            {s.profile_loss_ps != null ? row('Perda perfil (LP)', s.profile_loss_ps.toFixed(5)) : null}
            {s.profile_loss_ss != null ? row('Perda perfil (LA)', s.profile_loss_ss.toFixed(5)) : null}
            {s.endwall_loss != null ? row('Perda de parede (Denton)', s.endwall_loss.toFixed(5)) : null}
            {s.leakage_loss_m != null ? row('Perda de vazamento', `${s.leakage_loss_m.toFixed(3)} m`) : null}
            {s.volute_sizing?.throat_velocity_ms != null ? row('Vel. garganta voluta', `${s.volute_sizing.throat_velocity_ms.toFixed(1)} m/s`) : null}
          </tbody></table>
        </div>
      )}

      {/* Warnings */}
      {s.warnings?.length > 0 && (
        <div style={{ padding: 12, background: 'rgba(255,213,79,0.08)', border: '1px solid rgba(255,213,79,0.25)', borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-warning)', marginBottom: 6 }}>⚠ AVISOS ({s.warnings.length})</div>
          {s.warnings.map((w: string, i: number) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>• {w}</div>
          ))}
        </div>
      )}

      {/* Meridional view */}
      {showMeridional && mp?.d1 && (
        <div style={{ marginTop: 12 }}>
          <MeridionalView
            meridional={{ d1: mp.d1, d1_hub: mp.d1_hub, d2: mp.d2, b1: mp.b1, b2: mp.b2 }}
            blade_count={s.blade_count}
            beta1={s.beta1}
            beta2={s.beta2}
          />
        </div>
      )}
    </div>
  )
}
