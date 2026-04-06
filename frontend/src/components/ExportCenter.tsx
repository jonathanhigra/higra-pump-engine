import React from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onExport: (format: string) => void
  sizing?: any
  opPoint?: { flowRate: number; head: number; rpm: number }
  projectName?: string
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

function generateExecutiveSummary(sizing: any, opPoint: any, projectName?: string) {
  if (!sizing) return
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#333}
    h1{color:#0088cc;border-bottom:2px solid #0088cc;padding-bottom:8px;font-size:22px}
    .metrics{display:flex;justify-content:space-around;margin:24px 0}
    .metric{text-align:center}
    .metric .val{font-size:28px;font-weight:bold;color:#0088cc}
    .metric .lbl{font-size:11px;color:#888;margin-top:4px}
    .summary{font-size:14px;line-height:1.6;color:#555}
    hr{border:none;border-top:1px solid #ddd;margin:24px 0}
    .footer{font-size:9px;color:#aaa}
  </style></head><body>
    <h1>${projectName || 'Projeto HPE'}</h1>
    <p style="color:#888;font-size:12px">Resumo Executivo — ${new Date().toLocaleDateString('pt-BR')}</p>
    <div class="metrics">
      <div class="metric"><div class="val">${(sizing.estimated_efficiency * 100).toFixed(1)}%</div><div class="lbl">Eficiência</div></div>
      <div class="metric"><div class="val">${sizing.estimated_npsh_r.toFixed(1)}m</div><div class="lbl">NPSHr</div></div>
      <div class="metric"><div class="val">${(sizing.estimated_power / 1000).toFixed(1)}kW</div><div class="lbl">Potência</div></div>
    </div>
    <p class="summary">Rotor ${sizing.meridional_profile?.impeller_type || 'centrífugo'} de <b>${(sizing.impeller_d2 * 1000).toFixed(0)}mm</b> com ${sizing.blade_count} pás, operando a <b>${opPoint.rpm}rpm</b> com vazão de <b>${opPoint.flowRate}m³/h</b> e altura de <b>${opPoint.head}m</b>.</p>
    <hr><p class="footer">Gerado por HPE v0.1.0 — HIGRA Industrial Ltda.</p>
  </body></html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500) }
}

export default function ExportCenter({ open, onClose, onExport, sizing, opPoint, projectName }: Props) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
        borderRadius: 12, padding: 24, maxWidth: 620, width: '90%', maxHeight: '80vh', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: 16 }}>Centro de Exportação</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, fontFamily: 'var(--font-family)' }}>x</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 8, fontWeight: 600 }}>CAD / Geometria</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <ExportCard label="STEP" desc="SolidWorks, Inventor, Fusion" onClick={() => onExport('step')} />
            <ExportCard label="IGES" desc="B-Spline — CAD universal" onClick={() => onExport('iges')} />
            <ExportCard label="STL" desc="Impressão 3D, FEA" onClick={() => onExport('stl')} />
            <ExportCard label="glTF" desc="Web 3D — visualização" onClick={() => onExport('gltf')} />
            <ExportCard label="BladeGen" desc=".bgd — ANSYS BladeGen" onClick={() => onExport('bladegen')} />
            <ExportCard label="GEO" desc="TurboGrid — malha CFD" onClick={() => onExport('geo')} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 8, fontWeight: 600 }}>CFD / Simulação</div>
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
            {sizing && opPoint && (
              <ExportCard label="Resumo Executivo" desc="HTML -- imprimir/PDF" onClick={() => generateExecutiveSummary(sizing, opPoint, projectName)} />
            )}
            <ExportCard label="Email" desc="Enviar resultados por email" onClick={() => onExport('email')} />
          </div>
        </div>
      </div>
    </div>
  )
}
