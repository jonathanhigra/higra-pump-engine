import React, { useState } from 'react'
import t from '../i18n'

interface Props { losses: any }

const LOSS_DETAILS: Record<string, { desc: string; tip: string }> = {
  profile_loss_ps: { desc: 'Perda de perfil no lado de pressão (pressure side)', tip: 'Reduzir com ângulo β₂ menor ou polimento superficial (Ra < 1.6 μm)' },
  profile_loss_ss: { desc: 'Perda de perfil no lado de sucção (suction side)', tip: 'Verificar distribuição de carga — De Haller < 0.7 indica risco de separação' },
  tip_leakage: { desc: 'Perda por vazamento na folga de topo (tip clearance)', tip: 'Reduzir folga de topo — mínimo de 0.2 mm para operação estável' },
  endwall_hub: { desc: 'Perda de parede — disco de hub (modelo Denton)', tip: 'Otimizar perfil meridional do hub para reduzir gradiente de pressão adverso' },
  endwall_shroud: { desc: 'Perda de parede — shroud / carcaça', tip: 'Perfil de shroud mais suave e folga de topo controlada' },
  mixing: { desc: 'Perda de mistura na saída do rotor (jet-wake mixing)', tip: 'Aumentar número de pás ou usar pás interpassagem (splitters) para homogeneizar o fluxo' },
  incidence: { desc: 'Perda por incidência no bordo de ataque', tip: 'Ajustar β₁ para que coincida com o ângulo de entrada do escoamento' },
  recirculation: { desc: 'Perda por recirculação interna', tip: 'Verificar ponto de operação vs. curva de projeto — evitar operação longe do BEP' },
}

export default function LossBreakdownChart({ losses }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  if (!losses) return <p style={{ color: 'var(--text-muted)' }}>{t.lossUnavailable}</p>

  const items = [
    { key: 'profile_loss_ps', label: t.profilePS, color: '#2196F3' },
    { key: 'profile_loss_ss', label: t.profileSS, color: '#1976D2' },
    { key: 'tip_leakage', label: t.tipLeakage, color: '#FF9800' },
    { key: 'endwall_hub', label: t.endwallHub, color: '#9C27B0' },
    { key: 'endwall_shroud', label: t.endwallShroud, color: '#7B1FA2' },
    { key: 'mixing', label: t.mixing, color: '#F44336' },
    { key: 'incidence', label: t.incidence, color: '#4CAF50' },
    { key: 'recirculation', label: t.recirculation, color: '#795548' },
  ]
  const maxVal = Math.max(...items.map(i => losses[i.key] || 0), 0.01)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: 0 }}>{t.lossBreakdown}</h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— clique em uma barra para detalhes</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 560 }}>
        {items.map(item => {
          const val = losses[item.key] || 0
          const isSelected = selected === item.key
          const detail = LOSS_DETAILS[item.key]
          return (
            <div key={item.key}>
              <div
                onClick={() => setSelected(isSelected ? null : item.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 6px', borderRadius: 5, transition: 'background 0.15s', background: isSelected ? `${item.color}0a` : 'transparent' }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = `${item.color}07` }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ width: 130, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0, fontSize: 11 }}>{item.label}</span>
                <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 3, height: 18, position: 'relative' }}>
                  <div style={{ width: `${(val / maxVal) * 100}%`, background: item.color, height: '100%', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                <span style={{ width: 60, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>{val.toFixed(3)} m</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transform: isSelected ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {/* #12 — expandable detail panel */}
              {isSelected && detail && (
                <div style={{
                  marginLeft: 138, marginBottom: 6,
                  padding: '8px 12px', borderRadius: '0 0 6px 6px',
                  background: `${item.color}0d`, border: `1px solid ${item.color}30`,
                  borderTop: 'none', fontSize: 11,
                }}>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 500 }}>{detail.desc}</div>
                  <div style={{ color: '#f59e0b', display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                    <span style={{ flexShrink: 0 }}>💡</span>
                    <span>{detail.tip}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="card" style={{ marginTop: 16, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, color: 'var(--text-secondary)' }}>
          <span>{t.totalHeadLoss}:</span><b>{losses.total_head_loss?.toFixed(3)} m</b>
          <span>{t.lossCoefficient}:</span><b>{(losses.loss_coefficient * 100)?.toFixed(1)}%</b>
          <span>{t.diskFriction}:</span><b>{losses.disk_friction_power?.toFixed(1)} W</b>
        </div>
      </div>
    </div>
  )
}
