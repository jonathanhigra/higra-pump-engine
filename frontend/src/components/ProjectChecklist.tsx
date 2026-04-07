import React, { useState } from 'react'

interface Props {
  hasSizing: boolean
  hasViewedGeometry: boolean
  hasViewedAnalysis: boolean
  hasCheckedNpsh: boolean
  hasExported: boolean
}

export default function ProjectChecklist({
  hasSizing, hasViewedGeometry, hasViewedAnalysis, hasCheckedNpsh, hasExported,
}: Props) {
  const [open, setOpen] = useState(false)

  const steps = [
    { done: hasSizing,          label: 'Dimensionar', icon: '⚡' },
    { done: hasViewedGeometry,  label: '3D',          icon: '◈'  },
    { done: hasViewedAnalysis,  label: 'Perdas',      icon: '≋'  },
    { done: hasCheckedNpsh,     label: 'NPSHr',       icon: '◎'  },
    { done: hasExported,        label: 'Exportar',    icon: '↓'  },
  ]
  const completed = steps.filter(s => s.done).length
  const all = steps.length
  const pct = (completed / all) * 100
  const allDone = completed === all
  const accentColor = allDone ? '#22c55e' : 'var(--accent)'

  return (
    <div style={{ position: 'relative' }}>
      {/* Pill trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Progresso do projeto"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
          border: `1px solid ${allDone ? '#22c55e40' : 'var(--border-primary)'}`,
          background: allDone ? 'rgba(34,197,94,0.08)' : 'var(--bg-surface)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = allDone ? '#22c55e' : 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = allDone ? '#22c55e40' : 'var(--border-primary)' }}
      >
        {/* Mini progress arc */}
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border-primary)" strokeWidth="2.5" />
          <circle cx="8" cy="8" r="6" fill="none" stroke={accentColor} strokeWidth="2.5"
            strokeDasharray={`${(pct / 100) * 37.7} 37.7`}
            strokeLinecap="round"
            transform="rotate(-90 8 8)"
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 600, color: allDone ? '#22c55e' : 'var(--text-secondary)' }}>
          {completed}/{all}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
            background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
            borderRadius: 10, padding: '14px 16px', minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Progresso
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>
                {completed}/{all}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: 'var(--border-primary)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: accentColor, borderRadius: 2,
                transition: 'width 0.4s ease',
              }} />
            </div>

            {/* Steps list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: s.done ? 11 : 9,
                    background: s.done ? accentColor : 'var(--border-primary)',
                    color: s.done ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                  }}>
                    {s.done ? '✓' : s.icon}
                  </div>
                  <span style={{
                    fontSize: 12, color: s.done ? 'var(--text-secondary)' : 'var(--text-muted)',
                    textDecoration: s.done ? 'line-through' : 'none',
                    textDecorationColor: 'var(--text-muted)',
                    fontWeight: s.done ? 500 : 400,
                  }}>
                    {s.label}
                  </span>
                  {s.done && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', opacity: 0.7 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
