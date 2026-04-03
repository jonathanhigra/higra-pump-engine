import React, { useState, useEffect, useRef } from 'react'

export interface HistoryEntry {
  id: number
  timestamp: Date
  flowRate: number
  head: number
  rpm: number
  nq: number
  eta: number
  d2: number
}

interface Props {
  history: HistoryEntry[]
  onRestore: (entry: HistoryEntry) => void
}

export default function HistoryPanel({ history, onRestore }: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  /* Close on click outside */
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const formatTime = (d: Date) => {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Clock icon button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Historico de calculos"
        style={{
          background: open ? 'rgba(0,160,223,0.15)' : 'transparent',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border-primary)'}`,
          borderRadius: 6,
          width: 30,
          height: 30,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          transition: 'all 0.15s',
          padding: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          width: 360,
          maxHeight: 400,
          overflowY: 'auto',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-md)',
          zIndex: 1500,
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            HISTORICO ({history.length})
          </div>

          {history.length === 0 ? (
            <div style={{
              padding: '30px 14px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
              fontStyle: 'italic',
            }}>
              Nenhum calculo ainda
            </div>
          ) : (
            history.map(entry => (
              <div
                key={entry.id}
                onClick={() => { onRestore(entry); setOpen(false) }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  transition: 'background 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Time */}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0, width: 40 }}>
                  {formatTime(entry.timestamp)}
                </span>

                {/* Params */}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  Q={entry.flowRate} H={entry.head} n={entry.rpm}
                </span>

                {/* Results */}
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  Nq={entry.nq.toFixed(0)} {'\u03B7'}={(entry.eta * 100).toFixed(0)}% D2={entry.d2.toFixed(0)}mm
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
