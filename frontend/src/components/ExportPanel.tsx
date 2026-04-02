import React, { useState } from 'react'

interface Props {
  sizing: any
  op: { flowRate: number; head: number; rpm: number } | null
}

export default function ExportPanel({ sizing, op }: Props) {
  const [busy, setBusy] = useState<string | null>(null)

  if (!sizing || !op) return null

  const q = op.flowRate / 3600
  const h = op.head
  const n = op.rpm

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const downloadText = (text: string, filename: string) => {
    downloadBlob(new Blob([text], { type: 'text/plain' }), filename)
  }

  const exports = [
    {
      id: 'pdf', label: 'Relatório PDF', icon: '\uD83D\uDCC4', ext: '.pdf',
      action: async () => {
        const res = await fetch('/api/v1/report/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow_rate: q, head: h, rpm: n }),
        })
        if (res.ok) downloadBlob(await res.blob(), 'hpe_relatorio.pdf')
      },
    },
    {
      id: 'hpe', label: 'Projeto .hpe', icon: '\uD83D\uDCBE', ext: '.hpe',
      action: async () => {
        const res = await fetch('/api/v1/project/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'projeto', author: 'HIGRA',
            operating_point: { flow_rate: q, head: h, rpm: n },
          }),
        })
        const data = await res.json()
        if (data.file_b64) {
          const bytes = atob(data.file_b64)
          const arr = new Uint8Array(bytes.length)
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
          downloadBlob(new Blob([arr], { type: 'application/octet-stream' }), 'projeto.hpe')
        }
      },
    },
    {
      id: 'geo', label: 'Blade .geo', icon: '\uD83D\uDD37', ext: '.geo',
      action: async () => {
        const res = await fetch(`/api/v1/geometry/export/geo?flow_rate=${q}&head=${h}&rpm=${n}`)
        const data = await res.json()
        if (data.ps) downloadText(data.ps, 'blade_ps.geo')
      },
    },
    {
      id: 'bladegen', label: 'BladeGen .inf', icon: '\uD83D\uDD39', ext: '.inf',
      action: async () => {
        const res = await fetch(`/api/v1/geometry/export/bladegen?flow_rate=${q}&head=${h}&rpm=${n}`)
        const data = await res.json()
        if (data.inf) {
          downloadText(data.inf, 'blade.inf')
          downloadText(data.curve, 'blade.curve')
        }
      },
    },
  ]

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 10 }}>
        EXPORTAR RESULTADOS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {exports.map(ex => (
          <button
            key={ex.id}
            type="button"
            disabled={busy === ex.id}
            onClick={async () => {
              setBusy(ex.id)
              try { await ex.action() } finally { setBusy(null) }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
              border: '1px solid var(--border-primary)', borderRadius: 6, background: 'transparent',
              color: busy === ex.id ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: busy === ex.id ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 14 }}>{ex.icon}</span>
            {busy === ex.id ? 'Gerando...' : ex.label}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{ex.ext}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
