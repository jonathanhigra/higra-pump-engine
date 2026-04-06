import React from 'react'
import type { SizingResult, CurvePoint } from '../App'
import SmartWarnings from './SmartWarnings'

interface Props {
  sizing: SizingResult
  curves: CurvePoint[]
  losses: any
  stress: any
  opPoint: { flowRate: number; head: number; rpm: number }
  onNavigateTab: (tab: string) => void
}

function qualityLevel(sizing: SizingResult): { level: string; color: string; icon: string } {
  const eta = sizing.estimated_efficiency
  const npsh = sizing.estimated_npsh_r
  if (eta > 0.82 && npsh < 5) return { level: 'Excelente', color: '#22c55e', icon: '***' }
  if (eta > 0.78 && npsh < 7) return { level: 'Bom', color: '#2563eb', icon: '**' }
  if (eta > 0.70) return { level: 'Aceitavel', color: '#d97706', icon: '*' }
  return { level: 'Revisar', color: '#dc2626', icon: '!' }
}

export default function CompleteResultView({ sizing, curves, losses, stress, opPoint, onNavigateTab }: Props) {
  const q = qualityLevel(sizing)
  const eta = (sizing.estimated_efficiency * 100).toFixed(1)
  const d2mm = (sizing.impeller_d2 * 1000).toFixed(0)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Section 1: Summary */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          Resumo do Projeto
          <span style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 20,
            background: `${q.color}18`, border: `1px solid ${q.color}40`, color: q.color,
            fontWeight: 600,
          }}>{q.icon} {q.level}</span>
        </h3>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'center' }}>
            {[
              { label: 'Diâmetro D2', value: `${d2mm} mm`, color: 'var(--accent)' },
              { label: 'Eficiência', value: `${eta}%`, color: parseFloat(eta) > 80 ? '#22c55e' : '#d97706' },
              { label: 'NPSHr', value: `${sizing.estimated_npsh_r.toFixed(1)} m`, color: sizing.estimated_npsh_r < 6 ? '#22c55e' : '#dc2626' },
              { label: 'Potência', value: `${(sizing.estimated_power / 1000).toFixed(1)} kW`, color: '#a78bfa' },
              { label: 'Nq', value: sizing.specific_speed_nq.toFixed(0), color: '#a78bfa' },
              { label: 'Pás', value: String(sizing.blade_count), color: 'var(--text-primary)' },
            ].map(m => (
              <div key={m.label}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Ponto de operação: Q={opPoint.flowRate} m³/h, H={opPoint.head}m, n={opPoint.rpm}rpm
          </div>
        </div>
      </section>

      {/* Section 2: Geometry quick-link */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 16 }}>Geometria 3D</h3>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            Rotor {sizing.meridional_profile?.impeller_type || 'radial'} com {sizing.blade_count} pas
          </div>
          <button onClick={() => onNavigateTab('3d')} style={{
            padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            border: '1px solid var(--accent)', background: 'rgba(0,160,223,0.12)',
            color: 'var(--accent)', cursor: 'pointer',
          }}>
            Abrir Visualizacao 3D
          </button>
        </div>
      </section>

      {/* Section 3: Key angles and dimensions */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 16 }}>Dimensoes Principais</h3>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
            {[
              { label: 'D1 (entrada)', value: `${(sizing.impeller_d1 * 1000).toFixed(0)} mm` },
              { label: 'D2 (saida)', value: `${d2mm} mm` },
              { label: 'b2 (largura)', value: `${(sizing.impeller_b2 * 1000).toFixed(1)} mm` },
              { label: 'beta1', value: `${sizing.beta1.toFixed(1)} graus` },
              { label: 'beta2', value: `${sizing.beta2.toFixed(1)} graus` },
              { label: 'Z (pas)', value: String(sizing.blade_count) },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-primary)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Curves quick-link */}
      {curves.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ color: 'var(--accent)', fontSize: 16 }}>Curvas de Desempenho</h3>
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              {curves.length} pontos calculados na curva H-Q
            </div>
            <button onClick={() => onNavigateTab('curves')} style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--accent)', background: 'rgba(0,160,223,0.12)',
              color: 'var(--accent)', cursor: 'pointer',
            }}>
              Ver Curvas Completas
            </button>
          </div>
        </section>
      )}

      {/* Section 5: Warnings */}
      {sizing.warnings && sizing.warnings.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ color: 'var(--accent)', fontSize: 16 }}>Avisos</h3>
          <SmartWarnings warnings={sizing.warnings} sizing={sizing} />
        </section>
      )}

      {/* Section 6: Next steps */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 16 }}>Próximos Passos</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Visualizar 3D', tab: '3d', desc: 'Rotor completo em 3D interativo' },
            { label: 'Curvas H-Q', tab: 'curves', desc: 'Desempenho em faixa de vazão' },
            { label: 'Perdas', tab: 'losses', desc: 'Distribuição de perdas hidráulicas' },
            { label: 'Otimizar', tab: 'optimize', desc: 'Encontre o melhor compromisso' },
          ].map(s => (
            <button key={s.tab} onClick={() => onNavigateTab(s.tab)} className="card" style={{
              padding: 12, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-primary)',
              background: 'var(--bg-surface)', transition: 'all 0.15s',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 13, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.desc}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
