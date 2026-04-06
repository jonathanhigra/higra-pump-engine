import React from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onExport: (format: string) => void
}

function ExportCard({ label, desc, onClick }: { label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
      borderRadius: 6, padding: '10px 12px', cursor: 'pointer', textAlign: 'left' as const,
      transition: 'border-color 0.15s', width: '100%',
      fontFamily: 'var(--font-family)',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-primary)')}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
    </button>
  )
}

export default function ExportCenter({ open, onClose, onExport }: Props) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
        borderRadius: 12, padding: 24, maxWidth: 620, width: '90%', maxHeight: '80vh', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: 16 }}>Centro de Exportacao</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, fontFamily: 'var(--font-family)' }}>x</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 8, fontWeight: 600 }}>CAD / Geometria</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <ExportCard label="STEP" desc="SolidWorks, Inventor, Fusion" onClick={() => onExport('step')} />
            <ExportCard label="IGES" desc="B-Spline — CAD universal" onClick={() => onExport('iges')} />
            <ExportCard label="STL" desc="Impressao 3D, FEA" onClick={() => onExport('stl')} />
            <ExportCard label="glTF" desc="Web 3D — visualizacao" onClick={() => onExport('gltf')} />
            <ExportCard label="BladeGen" desc=".bgd — ANSYS BladeGen" onClick={() => onExport('bladegen')} />
            <ExportCard label="GEO" desc="TurboGrid — malha CFD" onClick={() => onExport('geo')} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 8, fontWeight: 600 }}>CFD / Simulacao</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <ExportCard label="Pacote CFX" desc="ZIP — CCL + mesh + BCs" onClick={() => onExport('cfx-package')} />
            <ExportCard label="Fluent .jou" desc="Journal TUI automatico" onClick={() => onExport('fluent')} />
            <ExportCard label="OpenFOAM" desc="Caso completo" onClick={() => onExport('openfoam')} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 8, fontWeight: 600 }}>Relatorio / Dados</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <ExportCard label="PDF" desc="Relatorio tecnico" onClick={() => onExport('pdf')} />
            <ExportCard label="CSV" desc="Planilha de dados" onClick={() => onExport('csv')} />
            <ExportCard label="PNG" desc="Screenshot 3D" onClick={() => onExport('png')} />
          </div>
        </div>
      </div>
    </div>
  )
}
