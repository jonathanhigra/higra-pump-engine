import React from 'react'
import t from '../i18n'

interface Props { losses: any }

export default function LossBreakdownChart({ losses }: Props) {
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
      <h3 style={{ color: 'var(--accent)', fontSize: 15 }}>{t.lossBreakdown}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 500 }}>
        {items.map(item => {
          const val = losses[item.key] || 0
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 130, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>{item.label}</span>
              <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 3, height: 18, position: 'relative' }}>
                <div style={{ width: `${(val / maxVal) * 100}%`, background: item.color, height: '100%', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              <span style={{ width: 60, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{val.toFixed(3)} m</span>
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
