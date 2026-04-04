import React, { useState, useEffect, useRef } from 'react'
import type { VersionEntry } from '../services/api'

interface Props {
  versions: VersionEntry[]
  currentVersionId?: string | null
  onSelect: (v: VersionEntry) => void
  onCompare: (a: VersionEntry, b: VersionEntry) => void
  onDelete: (id: string) => void
}

export default function VersionPanel({ versions, currentVersionId, onSelect, onCompare, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  /* Close on click outside */
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        if (next.size >= 2) {
          // Remove oldest selection to keep max 2
          const first = next.values().next().value
          if (first !== undefined) next.delete(first)
        }
        next.add(id)
      }
      return next
    })
  }

  const handleCompare = () => {
    const ids = Array.from(selected)
    if (ids.length !== 2) return
    const a = versions.find(v => v.id === ids[0])
    const b = versions.find(v => v.id === ids[1])
    if (a && b) {
      onCompare(a, b)
      setOpen(false)
      setSelected(new Set())
    }
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(id)
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const currentVersion = versions.find(v => v.id === currentVersionId)
  const badgeLabel = currentVersion ? `V${currentVersion.version_number}` : versions.length > 0 ? `V${versions[0].version_number}` : 'V0'

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button: badge + clock icon */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Historico de versoes"
        style={{
          background: open ? 'rgba(0,160,223,0.15)' : 'transparent',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border-primary)'}`,
          borderRadius: 6,
          height: 30,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          cursor: 'pointer',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          transition: 'all 0.15s',
          padding: '0 8px',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'var(--font-family)',
        }}
      >
        <span style={{
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: '16px',
        }}>
          {badgeLabel}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'fixed',
          top: 80,
          left: 260,
          width: 380,
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 1500,
          display: 'flex',
          flexDirection: 'column',
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
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            VERSOES ({versions.length})
          </div>

          {/* Version list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {versions.length === 0 ? (
              <div style={{ padding: '30px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                Nenhuma versao salva
              </div>
            ) : (
              versions.map(v => {
                const isCurrent = v.id === currentVersionId
                const isChecked = selected.has(v.id)
                return (
                  <div
                    key={v.id}
                    onClick={() => { onSelect(v); setOpen(false) }}
                    style={{
                      padding: '8px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.1s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      position: 'relative',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Version badge */}
                    <span style={{
                      background: isCurrent ? 'var(--accent)' : 'var(--bg-surface)',
                      color: isCurrent ? '#fff' : 'var(--text-muted)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                      minWidth: 26,
                      textAlign: 'center',
                      border: isCurrent ? 'none' : '1px solid var(--border-primary)',
                    }}>
                      V{v.version_number}
                    </span>

                    {/* Content: params + results */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Q={v.flow_rate >= 1 ? (v.flow_rate * 3600).toFixed(0) : v.flow_rate.toFixed(4)} H={v.head.toFixed(0)} n={v.rpm.toFixed(0)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Nq={v.nq.toFixed(1)} {'\u03B7'}={(v.eta * 100).toFixed(1)}% D2={v.d2_mm.toFixed(0)}mm
                      </div>
                    </div>

                    {/* Timestamp */}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {formatTime(v.created_at)}
                    </span>

                    {/* Checkbox for compare */}
                    <div
                      onClick={(e) => toggleCheck(v.id, e)}
                      style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                        border: `2px solid ${isChecked ? 'var(--accent)' : 'var(--border-primary)'}`,
                        background: isChecked ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isChecked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>

                    {/* Delete button (shows on hover via CSS-in-JS) */}
                    <div
                      className="version-delete-btn"
                      onClick={(e) => handleDelete(v.id, e)}
                      title="Excluir versao"
                      style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                        opacity: 0.4,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef5350' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Compare button */}
          {versions.length >= 2 && (
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={handleCompare}
                disabled={selected.size !== 2}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--font-family)',
                  borderRadius: 6,
                  cursor: selected.size === 2 ? 'pointer' : 'default',
                  border: `1px solid ${selected.size === 2 ? 'var(--accent)' : 'var(--border-primary)'}`,
                  background: selected.size === 2 ? 'rgba(0,160,223,0.15)' : 'transparent',
                  color: selected.size === 2 ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                Comparar selecionados ({selected.size}/2)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
