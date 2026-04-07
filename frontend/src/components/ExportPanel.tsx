import React, { useState } from 'react'
import ReportButton from './ReportButton'
import { exportSizingCSV } from '../services/api'

const SvgIcon = ({ d, size = 13 }: { d: string; size?: number }) => (
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
  const [expanded, setExpanded] = useState(false)

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
      id: 'pdf', label: 'Relatório', ext: 'PDF',
      icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
      color: '#ef4444',
      action: async () => {
        const res = await fetch('/api/v1/report/pdf', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow_rate: q, head: h, rpm: n }),
        })
        if (res.ok) downloadBlob(await res.blob(), 'hpe_relatorio.pdf')
      },
    },
    {
      id: 'hpe', label: 'Projeto', ext: '.hpe',
      icon: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z',
      color: 'var(--accent)',
      action: async () => {
        const res = await fetch('/api/v1/project/save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'projeto', author: 'HIGRA', operating_point: { flow_rate: q, head: h, rpm: n } }),
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
      id: 'csv', label: 'Dados', ext: 'CSV',
      icon: 'M4 15v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3',
      color: '#22c55e',
      action: async () => { exportSizingCSV(sizing, op) },
    },
    {
      id: 'geo', label: 'Blade', ext: '.geo',
      icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
      color: '#a78bfa',
      action: async () => {
        const res = await fetch(`/api/v1/geometry/export/geo?flow_rate=${q}&head=${h}&rpm=${n}`)
        const data = await res.json()
        if (data.ps) downloadText(data.ps, 'blade_ps.geo')
      },
    },
    {
      id: 'bladegen', label: 'BladeGen', ext: '.inf',
      icon: 'M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
      color: '#f59e0b',
      action: async () => {
        const res = await fetch(`/api/v1/geometry/export/bladegen?flow_rate=${q}&head=${h}&rpm=${n}`)
        const data = await res.json()
        if (data.inf) { downloadText(data.inf, 'blade.inf'); downloadText(data.curve, 'blade.curve') }
      },
    },
    {
      id: 'ptd', label: 'PTD', ext: '.td1',
      icon: 'M3 12h4l3-9 4 18 3-9h4',
      color: '#64748b',
      action: async () => {
        const res = await fetch('/api/v1/io/td1_perfdata', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow_rate: q, head: h, rpm: n }),
        })
        if (res.ok) downloadText(await res.text(), 'hpe_perfdata.td1')
      },
    },
  ]

  // Always-visible quick 3 + expand
  const quickExports = exports.slice(0, 3)
  const extraExports = exports.slice(3)

  return (
    <div style={{
      border: '1px solid var(--border-primary)', borderRadius: 8,
      background: 'var(--bg-surface)', overflow: 'hidden', marginTop: 10,
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border-primary)',
        cursor: 'pointer', userSelect: 'none',
      }} onClick={() => setExpanded(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
            EXPORTAR
          </span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Quick row — always visible */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border-primary)' }}>
        {quickExports.map(ex => (
          <button key={ex.id} type="button" disabled={busy === ex.id}
            title={`${ex.label} (${ex.ext})`}
            onClick={async (e) => {
              e.stopPropagation()
              setBusy(ex.id)
              try { await ex.action(); onExported?.() } finally { setBusy(null) }
            }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, padding: '8px 4px', background: 'var(--bg-surface)',
              border: 'none', cursor: busy === ex.id ? 'wait' : 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
          >
            <span style={{ color: busy === ex.id ? 'var(--text-muted)' : ex.color }}>
              <SvgIcon d={ex.icon} size={15} />
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {busy === ex.id ? '...' : ex.ext}
            </span>
          </button>
        ))}
      </div>

      {/* Expanded extras */}
      {expanded && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {extraExports.map(ex => (
            <button key={ex.id} type="button" disabled={busy === ex.id}
              onClick={async () => {
                setBusy(ex.id)
                try { await ex.action(); onExported?.() } finally { setBusy(null) }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                border: '1px solid var(--border-primary)', borderRadius: 5, background: 'transparent',
                color: busy === ex.id ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: busy === ex.id ? 'wait' : 'pointer', fontSize: 11, fontWeight: 500,
                transition: 'all 0.15s', textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = ex.color; e.currentTarget.style.color = ex.color }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <span style={{ color: ex.color, flexShrink: 0 }}><SvgIcon d={ex.icon} size={13} /></span>
              <span style={{ flex: 1 }}>{ex.label}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{ex.ext}</span>
            </button>
          ))}
          {/* Client-side PDF */}
          <div style={{ marginTop: 2 }}>
            <ReportButton sizing={sizing} opPoint={op!} curves={curves || []} projectName={projectName} />
          </div>
        </div>
      )}
    </div>
  )
}
