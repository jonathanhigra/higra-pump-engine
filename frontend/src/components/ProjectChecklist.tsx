import React from 'react'

interface Props {
  hasSizing: boolean
  hasViewedGeometry: boolean
  hasViewedAnalysis: boolean
  hasCheckedNpsh: boolean
  hasExported: boolean
}

export default function ProjectChecklist({ hasSizing, hasViewedGeometry, hasViewedAnalysis, hasCheckedNpsh, hasExported }: Props) {
  const items = [
    { done: hasSizing, label: 'Dimensionamento calculado' },
    { done: hasViewedGeometry, label: 'Geometria 3D verificada' },
    { done: hasViewedAnalysis, label: 'Análise de perdas revisada' },
    { done: hasCheckedNpsh, label: 'NPSHr verificado' },
    { done: hasExported, label: 'Projeto exportado' },
  ]
  const completed = items.filter(i => i.done).length

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--text-muted)' }}>Progresso</span>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{completed}/{items.length}</span>
      </div>
      <div style={{ height: 3, background: 'var(--border-primary)', borderRadius: 2, marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${(completed / items.length) * 100}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', color: item.done ? 'var(--accent-success)' : 'var(--text-muted)' }}>
          <span style={{ fontSize: 12 }}>{item.done ? '\u2713' : '\u25CB'}</span>
          <span style={{ textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.7 : 1 }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
