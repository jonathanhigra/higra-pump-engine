import React from 'react'

interface Props {
  losses: any
}

export default function LossBreakdownChart({ losses }: Props) {
  if (!losses) return <p style={{ color: '#999' }}>Loss data unavailable. Check if the /losses endpoint is running.</p>

  const items = [
    { key: 'profile_loss_ps', label: 'Profile (PS)', color: '#2196F3' },
    { key: 'profile_loss_ss', label: 'Profile (SS)', color: '#1976D2' },
    { key: 'tip_leakage', label: 'Tip Leakage', color: '#FF9800' },
    { key: 'endwall_hub', label: 'Endwall (Hub)', color: '#9C27B0' },
    { key: 'endwall_shroud', label: 'Endwall (Shroud)', color: '#7B1FA2' },
    { key: 'mixing', label: 'Mixing', color: '#F44336' },
    { key: 'incidence', label: 'Incidence', color: '#4CAF50' },
    { key: 'recirculation', label: 'Recirculation', color: '#795548' },
  ]

  const maxVal = Math.max(...items.map(i => losses[i.key] || 0), 0.01)

  return (
    <div>
      <h3 style={{ color: '#2E8B57', fontSize: 15 }}>Loss Breakdown</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 500 }}>
        {items.map(item => {
          const val = losses[item.key] || 0
          const pct = (val / maxVal) * 100
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 120, color: '#555', textAlign: 'right', flexShrink: 0 }}>{item.label}</span>
              <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 3, height: 18, position: 'relative' }}>
                <div style={{ width: `${pct}%`, background: item.color, height: '100%', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              <span style={{ width: 60, fontSize: 12, color: '#777', flexShrink: 0 }}>{val.toFixed(3)} m</span>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: '#f8f9fa', borderRadius: 6, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <span>Total head loss:</span><b>{losses.total_head_loss?.toFixed(3)} m</b>
          <span>Loss coefficient:</span><b>{(losses.loss_coefficient * 100)?.toFixed(1)}%</b>
          <span>Disk friction:</span><b>{losses.disk_friction_power?.toFixed(1)} W</b>
        </div>
      </div>
    </div>
  )
}
