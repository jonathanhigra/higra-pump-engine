import React from 'react'

const MACHINES = [
  { id: 'centrifugal_pump', label: 'Bomba Centrífuga', nq: '10–100', icon: '⚙️', desc: 'Alta pressão, fluxo radial' },
  { id: 'mixed_flow_pump', label: 'Bomba Mista', nq: '80–160', icon: '🌀', desc: 'Fluxo diagonal misto' },
  { id: 'axial_pump', label: 'Bomba Axial', nq: '120–300', icon: '💨', desc: 'Alta vazão, baixa pressão' },
  { id: 'francis_turbine', label: 'Turbina Francis', nq: '50–250', icon: '⚡', desc: 'Turbina de reação mista' },
  { id: 'radial_inflow_turbine', label: 'Turbina Radial', nq: '30–100', icon: '🔄', desc: 'Fluxo radial centrípeto' },
  { id: 'centrifugal_compressor', label: 'Compressor Centrífugo', nq: '20–80', icon: '🌪️', desc: 'Gás compressível' },
]

interface Props {
  selected: string
  onSelect: (machineType: string) => void
}

export default function MachineSelectorPanel({ selected, onSelect }: Props) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--border-primary)' }}>
      <h3 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 14 }}>Tipo de Máquina</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {MACHINES.map(m => (
          <button key={m.id} onClick={() => onSelect(m.id)}
            style={{
              background: selected === m.id ? 'var(--accent)' : 'var(--bg-surface)',
              border: `1px solid ${selected === m.id ? 'var(--accent)' : 'var(--border-primary)'}`,
              borderRadius: 6, padding: '10px 8px', cursor: 'pointer',
              color: selected === m.id ? '#fff' : 'var(--text-primary)',
              textAlign: 'left', transition: 'all 0.15s',
            }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 10, color: selected === m.id ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', marginTop: 2 }}>
              Nq: {m.nq}
            </div>
            <div style={{ fontSize: 10, color: selected === m.id ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', marginTop: 2 }}>
              {m.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
