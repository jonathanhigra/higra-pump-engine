import React from 'react'

const MACHINE_ICON_PATHS: Record<string, string> = {
  centrifugal_pump: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  mixed_flow_pump: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  axial_pump: 'M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1011 16H22m-8-6a2 2 0 012-2h8m-12 4a2 2 0 00-2 2H2',
  francis_turbine: 'M13 10V3L4 14h7v7l9-11h-7z',
  radial_inflow_turbine: 'M23 4v6h-6M1 20v-6h6m-4.24 1.76a9 9 0 0114.14-1.42M2.1 13.66a9 9 0 0114.14-1.42',
  centrifugal_compressor: 'M3 12h4l3-9 4 18 3-9h4',
}

const MACHINES = [
  { id: 'centrifugal_pump', label: 'Bomba Centrífuga', nq: '10–100', desc: 'Alta pressão, fluxo radial' },
  { id: 'mixed_flow_pump', label: 'Bomba Mista', nq: '80–160', desc: 'Fluxo diagonal misto' },
  { id: 'axial_pump', label: 'Bomba Axial', nq: '120–300', desc: 'Alta vazão, baixa pressão' },
  { id: 'francis_turbine', label: 'Turbina Francis', nq: '50–250', desc: 'Turbina de reação mista' },
  { id: 'radial_inflow_turbine', label: 'Turbina Radial', nq: '30–100', desc: 'Fluxo radial centrípeto' },
  { id: 'centrifugal_compressor', label: 'Compressor Centrífugo', nq: '20–80', desc: 'Gás compressível' },
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
            <div style={{ marginBottom: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={MACHINE_ICON_PATHS[m.id] || ''} />
              </svg>
            </div>
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
