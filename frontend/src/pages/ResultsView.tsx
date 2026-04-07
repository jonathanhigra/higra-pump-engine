import React, { useState } from 'react'
import MeridionalView from '../components/MeridionalView'
import EngineeringTooltip from '../components/EngineeringTooltip'
import DeltaIndicator from '../components/DeltaIndicator'
import SmartWarnings from '../components/SmartWarnings'
import FeedbackStars from '../components/FeedbackStars'

interface Props {
  sizing: any
  previousSizing?: any
}

function narrateResults(s: any) {
  if (!('speechSynthesis' in window)) return
  const msg = new SpeechSynthesisUtterance(
    `O dimensionamento resultou em um rotor de ${(s.impeller_d2 * 1000).toFixed(0)} milímetros com ${s.blade_count} pás. Eficiência total de ${(s.estimated_efficiency * 100).toFixed(1)} por cento. N P S H requerido de ${s.estimated_npsh_r.toFixed(1)} metros. Potência estimada de ${(s.estimated_power / 1000).toFixed(1)} quilowatts.`
  )
  msg.lang = 'pt-BR'; msg.rate = 0.9
  speechSynthesis.speak(msg)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      title="Copiar" style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
        color: copied ? 'var(--accent-success, #4caf50)' : 'var(--text-muted)', fontSize: 10,
      }}>
      {copied ? '\u2713' : '\u2398'}
    </button>
  )
}

export default function ResultsView({ sizing: s, previousSizing: ps }: Props) {
  const [section, setSection] = useState<'geo' | 'perf' | 'losses' | null>('geo')
  const [showMeridional, setShowMeridional] = useState(false)

  const u = s.uncertainty || {}
  const mp = s.meridional_profile || {}
  const eta = (s.estimated_efficiency || 0) * 100
  const etaColor = eta >= 80 ? '#2563eb' : eta >= 70 ? '#d97706' : '#dc2626'
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

  const row = (label: React.ReactNode, value: string, pct?: number) => (
    <tr key={typeof label === 'string' ? label : value}>
      <td style={{ padding: '3px 10px 3px 0', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '3px 0', fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
        {value}
        {pct != null && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--accent-warning)' }}>±{pct.toFixed(0)}%</span>}
      </td>
    </tr>
  )

  return (
    <div>
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        <SectionBtn id="geo" label="Geometria" />
        <SectionBtn id="perf" label="Desempenho" />
        <SectionBtn id="losses" label="Perdas" />
        <button type="button" onClick={() => setShowMeridional(v => !v)}
          style={{ marginLeft: 'auto', fontSize: 10, padding: '4px 9px', borderRadius: 5, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
          {showMeridional ? 'Fechar' : '◻ Meridional'}
        </button>
      </div>

      {section === 'geo' && (
        <div className="card" style={{ marginBottom: 8, padding: '6px 10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {row(<><EngineeringTooltip term="D2">D2</EngineeringTooltip> (saida)</>, `${(s.impeller_d2 * 1000).toFixed(1)} mm`, u.d2_pct)}
            {row(<><EngineeringTooltip term="D1">D1</EngineeringTooltip> (entrada)</>, `${(s.impeller_d1 * 1000).toFixed(1)} mm`)}
            {row(<><EngineeringTooltip term="b2">b2</EngineeringTooltip> (largura)</>, `${(s.impeller_b2 * 1000).toFixed(1)} mm`, u.b2_pct)}
            {row('Z (pás)', `${s.blade_count}`)}
            {row(<EngineeringTooltip term={'\u03B2\u2081'}>{'\u03B21'}</EngineeringTooltip>, `${s.beta1?.toFixed(1)}\u00B0`, u.beta2_pct)}
            {row(<EngineeringTooltip term={'\u03B2\u2082'}>{'\u03B22'}</EngineeringTooltip>, `${s.beta2?.toFixed(1)}\u00B0`, u.beta2_pct)}
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
        <div className="card" style={{ marginBottom: 8, padding: '6px 10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            <tr>
              <td style={{ padding: '3px 10px 3px 0', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>Rendimento total <EngineeringTooltip term={'\u03B7'}>{'\u03B7'}</EngineeringTooltip></td>
              <td style={{ padding: '3px 0', fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                {eta.toFixed(1)}%
                {u.eta_pct != null && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--accent-warning)' }}>+/-{u.eta_pct.toFixed(0)}%</span>}
                {ps && <DeltaIndicator current={s.estimated_efficiency} previous={ps.estimated_efficiency} format="pct" higherIsBetter={true} />}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '3px 10px 3px 0', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>Potência</td>
              <td style={{ padding: '3px 0', fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                {(s.estimated_power / 1000).toFixed(2)} kW
                {ps && <DeltaIndicator current={s.estimated_power / 1000} previous={ps.estimated_power / 1000} format="pct" higherIsBetter={false} />}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '3px 10px 3px 0', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}><EngineeringTooltip term="NPSHr">NPSHr</EngineeringTooltip></td>
              <td style={{ padding: '3px 0', fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                {s.estimated_npsh_r?.toFixed(2)} m
                {u.npsh_pct != null && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--accent-warning)' }}>+/-{u.npsh_pct.toFixed(0)}%</span>}
                {ps && <DeltaIndicator current={s.estimated_npsh_r} previous={ps.estimated_npsh_r} format="pct" higherIsBetter={false} />}
              </td>
            </tr>
            {row(<EngineeringTooltip term="Nq">Nq</EngineeringTooltip>, `${s.specific_speed_nq?.toFixed(1)}`)}
            {row('Tipo de rotor', s.impeller_type || '—')}
            {s.diffusion_ratio ? row('Razão de difusão (De Haller)', s.diffusion_ratio.toFixed(3)) : null}
            {s.convergence_iterations ? row('Conv. iterações', `${s.convergence_iterations}`) : null}
          </tbody></table>
        </div>
      )}

      {section === 'losses' && (
        <div className="card" style={{ marginBottom: 8, padding: '6px 10px' }}>
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

      {/* What-if quick buttons */}
      <div style={{ display: 'flex', gap: 5, marginTop: 6, marginBottom: 6 }}>
        {[
          { label: '+10% RPM', tip: 'Simular aumento de rotação' },
          { label: '+1 pá', tip: 'Adicionar uma pá ao rotor' },
          { label: 'D2 -10%', tip: 'Reduzir diâmetro de saída' },
        ].map(btn => (
          <button key={btn.label} type="button" title={btn.tip}
            onClick={() => {
              const text = `What-if: ${btn.label} -- execute novamente com parâmetro ajustado`
              navigator.clipboard.writeText(text)
            }}
            style={{
              padding: '3px 10px', fontSize: 10, borderRadius: 4,
              border: '1px solid var(--border-primary)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-family)',
            }}>{btn.label}</button>
        ))}
      </div>

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

      <FeedbackStars tab="results" />
    </div>
  )
}
