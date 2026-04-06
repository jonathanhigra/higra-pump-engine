import React from 'react'

export interface TimelineEntry {
  time: Date
  action: string
  detail?: string
}

interface Props {
  entries: TimelineEntry[]
  open: boolean
  onClose: () => void
}

export default function ActionTimeline({ entries, open, onClose }: Props) {
  if (!open || entries.length === 0) return null
  return (
    <div style={{
      position: 'fixed', right: 0, top: 80, bottom: 40, width: 280, zIndex: 1800,
      background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border-primary)',
      overflowY: 'auto', padding: 16, boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: 'var(--accent)' }}>Historico de Acoes</h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>
          x
        </button>
      </div>
      {entries.slice().reverse().map((e, i) => (
        <div key={i} style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 12, marginBottom: 12, fontSize: 12 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {e.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ color: 'var(--text-primary)' }}>{e.action}</div>
          {e.detail && <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{e.detail}</div>}
        </div>
      ))}
    </div>
  )
}
