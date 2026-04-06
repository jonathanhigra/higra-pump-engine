import React from 'react'

const CHANGELOG = [
  { version: '0.2.0', items: [
    'Malha CFD com boundary layer e Y+ estimado',
    'Modo Apresentacao para reunioes',
    'Export Center unificado (CAD + CFD + Relatorio)',
    '3 temas: Escuro / Claro / Alto Contraste',
    'Medicao interativa no 3D',
    'Voluta 3D realista com tongue e diffuser',
    'F1 para ajuda contextual',
  ]},
]

export default function WhatsNew({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2500, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
        borderRadius: 12, padding: 24, maxWidth: 420, width: '90%' }}>
        <h3 style={{ color: 'var(--accent)', margin: '0 0 16px', fontSize: 16 }}>O que ha de novo</h3>
        {CHANGELOG.map(v => (
          <div key={v.version}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>v{v.version}</div>
            <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {v.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        ))}
        <button className="btn-primary" onClick={onClose} style={{ width: '100%', marginTop: 8 }}>Entendi!</button>
      </div>
    </div>
  )
}
