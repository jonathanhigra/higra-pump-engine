import React, { useState, useEffect, useRef, useMemo } from 'react'
import { SUB_TABS, type Tab, type Section } from './Sidebar'

/* ── Category labels for each section ─────────────────────────────────────── */
const SECTION_CATEGORY: Record<Section, string> = {
  projects: 'Projetos',
  templates: 'Templates',
  design: 'Design',
  geometry: 'Geometria',
  analysis: 'Análise',
  optimization: 'Otimização',
  assistant: 'Assistente',
}

/* ── Section icons (SVG path d) ───────────────────────────────────────────── */
const SECTION_ICONS: Record<Section, string> = {
  projects: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  templates: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z',
  design: 'M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
  geometry: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  analysis: 'M3 12h4l3-9 4 18 3-9h4',
  optimization: 'M13 10V3L4 14h7v7l9-11h-7z',
  assistant: 'M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
}

/* ── Item definition ──────────────────────────────────────────────────────── */
interface PaletteItem {
  id: string
  label: string
  category: string
  icon: string
  action: () => void
}

/* ── Sizing result type (subset) ──────────────────────────────────────────── */
interface SizingResult {
  specific_speed_nq: number
  impeller_d2: number
  impeller_b2: number
  blade_count: number
  estimated_efficiency: number
  estimated_npsh_r: number
  estimated_power: number
  [key: string]: any
}

/* ── Props ────────────────────────────────────────────────────────────────── */
interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (page: 'projects' | 'design', tab?: Tab) => void
  onRunSizing?: () => void
  onStartTour?: () => void
  sizing?: SizingResult | null
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function CommandPalette({ open, onClose, onNavigate, onRunSizing, onStartTour, sizing }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /* Build searchable items from SUB_TABS + special actions */
  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = []

    // All sub-tabs from all sections
    for (const [section, tabs] of Object.entries(SUB_TABS) as [Section, { key: Tab; label: string }[]][]) {
      for (const t of tabs) {
        list.push({
          id: `tab-${t.key}`,
          label: t.label,
          category: SECTION_CATEGORY[section],
          icon: SECTION_ICONS[section],
          action: () => { onNavigate('design', t.key); onClose() },
        })
      }
    }

    // Special actions
    list.push({
      id: 'action-run-sizing',
      label: 'Executar Dimensionamento',
      category: 'Ferramentas',
      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
      action: () => { onRunSizing?.(); onClose() },
    })
    list.push({
      id: 'action-save',
      label: 'Salvar Design',
      category: 'Ferramentas',
      icon: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z',
      action: () => onClose(), // handled externally via keyboard shortcuts
    })
    list.push({
      id: 'action-export-step',
      label: 'Exportar STEP',
      category: 'Ferramentas',
      icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
      action: () => { onNavigate('design', 'results'); onClose() },
    })
    list.push({
      id: 'action-export-stl',
      label: 'Exportar STL',
      category: 'Ferramentas',
      icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
      action: () => { onNavigate('design', 'results'); onClose() },
    })
    // Navigation shortcuts
    list.push({
      id: 'nav-projects',
      label: 'Projetos',
      category: 'Projetos',
      icon: SECTION_ICONS.projects,
      action: () => { onNavigate('projects'); onClose() },
    })
    list.push({
      id: 'nav-assistant',
      label: 'Assistente IA',
      category: 'Assistente',
      icon: SECTION_ICONS.assistant,
      action: () => { onNavigate('design', 'assistant'); onClose() },
    })
    list.push({
      id: 'nav-templates',
      label: 'Templates',
      category: 'Templates',
      icon: SECTION_ICONS.templates,
      action: () => { onNavigate('design', 'templates'); onClose() },
    })
    list.push({
      id: 'action-tour',
      label: 'Tour Guiado',
      category: 'Ajuda',
      icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.08 4h.01',
      action: () => { onStartTour?.(); onClose() },
    })

    // Sizing result values — searchable when sizing exists
    if (sizing) {
      const resultIcon = 'M3 12h4l3-9 4 18 3-9h4'
      const goResults = () => { onNavigate('design', 'results'); onClose() }
      list.push(
        { id: 'res-d2', label: `D2 = ${(sizing.impeller_d2 * 1000).toFixed(0)}mm`, category: 'Resultado', icon: resultIcon, action: goResults },
        { id: 'res-nq', label: `Nq = ${sizing.specific_speed_nq.toFixed(1)}`, category: 'Resultado', icon: resultIcon, action: goResults },
        { id: 'res-eta', label: `\u03B7 = ${(sizing.estimated_efficiency * 100).toFixed(1)}%`, category: 'Resultado', icon: resultIcon, action: goResults },
        { id: 'res-npsh', label: `NPSHr = ${sizing.estimated_npsh_r.toFixed(1)}m`, category: 'Resultado', icon: resultIcon, action: goResults },
        { id: 'res-power', label: `Potencia = ${(sizing.estimated_power / 1000).toFixed(1)}kW`, category: 'Resultado', icon: resultIcon, action: goResults },
        { id: 'res-z', label: `Z = ${sizing.blade_count} pas`, category: 'Resultado', icon: resultIcon, action: goResults },
      )
    }

    return list
  }, [onNavigate, onClose, onRunSizing, onStartTour, sizing])

  /* Filtered results */
  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(i => i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
  }, [items, query])

  /* Reset on open/close */
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  /* Keep selected index in bounds */
  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(Math.max(0, filtered.length - 1))
  }, [filtered.length, selectedIdx])

  /* Scroll selected item into view */
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIdx] as HTMLElement
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  if (!open) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIdx]) filtered[selectedIdx].action()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 120,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480, maxHeight: 400,
          background: 'var(--bg-elevated)',
          borderRadius: 12,
          border: '1px solid var(--border-primary)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }}
          placeholder="Buscar funcionalidade..."
          style={{
            width: '100%', height: 48, fontSize: 16,
            border: 'none', borderBottom: '1px solid var(--border-subtle)',
            padding: '0 16px',
            background: 'transparent',
            color: 'var(--text-primary)',
            outline: 'none',
            fontFamily: 'var(--font-family)',
          }}
        />

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              Nenhum resultado encontrado
            </div>
          )}
          {filtered.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => item.action()}
              onMouseEnter={() => setSelectedIdx(idx)}
              style={{
                height: 40, padding: '8px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer',
                background: idx === selectedIdx ? 'rgba(0,160,223,0.12)' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              {/* Icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {/* Label */}
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                {item.label}
              </span>
              {/* Category badge */}
              <span style={{
                fontSize: 10, padding: '2px 8px',
                background: 'var(--bg-surface)', borderRadius: 10,
                color: 'var(--text-muted)', fontWeight: 500,
              }}>
                {item.category}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '6px 16px', borderTop: '1px solid var(--border-subtle)',
          fontSize: 11, color: 'var(--text-muted)',
          display: 'flex', gap: 16,
        }}>
          <span>&#8593;&#8595; navegar</span>
          <span>&#9166; selecionar</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </div>
  )
}
