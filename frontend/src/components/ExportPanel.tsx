import React, { useState } from 'react'
import ReportButton from './ReportButton'
import { exportSizingCSV } from '../services/api'

const SvgIcon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

interface Props {
  sizing: any
  op: { flowRate: number; head: number; rpm: number } | null
  curves?: any[]
  projectName?: string
  onExported?: () => void
}

export default function ExportPanel({ sizing, op, curves, projectName, onExported }: Props) {
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
      id: 'pdf', label: 'Relatório PDF', iconPath: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', ext: '.pdf',
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
      id: 'hpe', label: 'Projeto .hpe', iconPath: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z', ext: '.hpe',
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
      id: 'geo', label: 'Blade .geo', iconPath: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', ext: '.geo',
      action: async () => {
        const res = await fetch(`/api/v1/geometry/export/geo?flow_rate=${q}&head=${h}&rpm=${n}`)
        const data = await res.json()
        if (data.ps) downloadText(data.ps, 'blade_ps.geo')
      },
    },
    {
      id: 'bladegen', label: 'BladeGen .inf', iconPath: 'M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z', ext: '.inf',
      action: async () => {
        const res = await fetch(`/api/v1/geometry/export/bladegen?flow_rate=${q}&head=${h}&rpm=${n}`)
        const data = await res.json()
        if (data.inf) {
          downloadText(data.inf, 'blade.inf')
          downloadText(data.curve, 'blade.curve')
        }
      },
    },
    {
      id: 'ptd', label: 'Arquivo PTD', iconPath: 'M3 12h4l3-9 4 18 3-9h4', ext: '.td1',
      action: async () => {
        const res = await fetch('/api/v1/io/td1_perfdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow_rate: q, head: h, rpm: n }),
        })
        if (res.ok) {
          const text = await res.text()
          downloadText(text, 'hpe_perfdata.td1')
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
              try { await ex.action(); onExported?.() } finally { setBusy(null) }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
              border: '1px solid var(--border-primary)', borderRadius: 6, background: 'transparent',
              color: busy === ex.id ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: busy === ex.id ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            <SvgIcon d={ex.iconPath} />
            {busy === ex.id ? 'Gerando...' : ex.label}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{ex.ext}</span>
          </button>
        ))}
        {/* CSV export */}
        <button
          type="button"
          onClick={() => { exportSizingCSV(sizing, op); onExported?.() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
            border: '1px solid var(--border-primary)', borderRadius: 6, background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          <SvgIcon d="M4 15v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          CSV
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>.csv</span>
        </button>
        {/* Client-side PDF report generation */}
        <ReportButton sizing={sizing} opPoint={op!} curves={curves || []} projectName={projectName} />
      </div>
    </div>
  )
}
