import React, { useEffect } from 'react'

interface Props {
  x: number; y: number; onClose: () => void
  onRecalculate?: () => void; onExport?: () => void; onHelp?: () => void
}

export default function GlobalContextMenu({ x, y, onClose, onRecalculate, onExport, onHelp }: Props) {
  useEffect(() => {
    const handleClick = () => onClose()
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const items = [
    onRecalculate && { label: 'Recalcular', shortcut: 'F5', action: onRecalculate },
    onExport && { label: 'Exportar', shortcut: 'Ctrl+E', action: onExport },
    onHelp && { label: 'Ajuda', shortcut: 'F1', action: onHelp },
  ].filter(Boolean) as { label: string; shortcut: string; action: () => void }[]

  if (items.length === 0) return null

  return (
    <div style={{
      position: 'fixed', left: x, top: y, zIndex: 3000,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
      borderRadius: 8, padding: 4, minWidth: 160, boxShadow: 'var(--shadow-md)',
    }}>
      {items.map(item => (
        <button key={item.label} onClick={() => { item.action(); onClose() }} style={{
          display: 'flex', justifyContent: 'space-between', width: '100%',
          padding: '7px 12px', background: 'none', border: 'none',
          color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
          borderRadius: 4, fontFamily: 'var(--font-family)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <span>{item.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 16 }}>{item.shortcut}</span>
        </button>
      ))}
    </div>
  )
}
