import React, { useState, useEffect } from 'react'
import t, { setLang, getCurrentLang, type LangKey } from '../i18n'

/* ── Tab type — every sub-page the app can show ────────────────────────────── */
export type Tab =
  | 'results' | 'curves' | '3d' | 'velocity' | 'losses' | 'stress'
  | 'compare' | 'assistant' | 'optimize' | 'loading' | 'pressure'
  | 'multispeed' | 'meridional-editor' | 'spanwise'
  | 'templates' | 'doe' | 'pareto' | 'lean-sweep' | 'lete'
  | 'meridional-drag' | 'noise' | 'batch'

/* ── Main sidebar sections (6 primary destinations) ────────────────────────── */
export type Section = 'projects' | 'templates' | 'design' | 'geometry' | 'analysis' | 'optimization' | 'assistant'

export function sectionForTab(tab: Tab): Section {
  switch (tab) {
    case 'results': case 'curves': case 'multispeed': return 'design'
    case '3d': case 'meridional-drag': case 'meridional-editor': case 'lete': case 'lean-sweep': return 'geometry'
    case 'velocity': case 'losses': case 'pressure': case 'loading':
    case 'spanwise': case 'noise': case 'stress': case 'compare': return 'analysis'
    case 'optimize': case 'pareto': case 'doe': case 'batch': return 'optimization'
    case 'assistant': return 'assistant'
    case 'templates': return 'templates'
    default: return 'design'
  }
}

export const SUB_TABS: Record<Section, { key: Tab; label: string }[]> = {
  projects: [],
  templates: [],
  assistant: [],
  design: [
    { key: 'results', label: 'Dimensionamento' },
    { key: 'curves', label: 'Curvas H-Q' },
    { key: 'multispeed', label: 'Multi-Velocidade' },
  ],
  geometry: [
    { key: '3d', label: 'Rotor 3D' },
    { key: 'meridional-drag', label: 'Editor Meridional' },
    { key: 'meridional-editor', label: 'Meridional Avançado' },
    { key: 'lete', label: 'LE / TE' },
    { key: 'lean-sweep', label: 'Lean / Sweep / Bow' },
  ],
  analysis: [
    { key: 'velocity', label: 'Velocidades' },
    { key: 'losses', label: 'Perdas' },
    { key: 'pressure', label: 'Pressão PS/SS' },
    { key: 'loading', label: 'Carregamento rVθ' },
    { key: 'spanwise', label: 'Spanwise' },
    { key: 'noise', label: 'Ruído' },
    { key: 'stress', label: 'Tensões' },
    { key: 'compare', label: 'Comparação' },
  ],
  optimization: [
    { key: 'optimize', label: 'NSGA-II / Bayesian' },
    { key: 'pareto', label: 'Fronteira Pareto' },
    { key: 'doe', label: 'DoE / Surrogate' },
    { key: 'batch', label: 'Batch / Paramétrico' },
  ],
}

/* ── Props ─────────────────────────────────────────────────────────────────── */
interface Props {
  page: 'projects' | 'design'
  activeTab: Tab | null
  userName: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onNavigate: (page: 'projects' | 'design', tab?: Tab) => void
  onLogout: () => void
  warningCount?: number
}

/* ── SVG icon helper ───────────────────────────────────────────────────────── */
const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24"><path d={d} /></svg>
)

/* ── Sidebar nav items ─────────────────────────────────────────────────────── */
interface SidebarItem {
  key: Section
  label: string
  icon: React.ReactNode
  defaultTab?: Tab
  isPage?: 'projects'
}

const NAV_ITEMS: SidebarItem[] = [
  { key: 'projects', label: t.navProjects, isPage: 'projects',
    icon: <I d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /> },
  { key: 'templates', label: 'Templates', defaultTab: 'templates',
    icon: <I d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" /> },
  { key: 'design', label: 'Design', defaultTab: 'results',
    icon: <I d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /> },
  { key: 'geometry', label: 'Geometria', defaultTab: 'meridional-drag',
    icon: <I d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /> },
  { key: 'analysis', label: 'Análise', defaultTab: 'velocity',
    icon: <I d="M3 12h4l3-9 4 18 3-9h4" /> },
  { key: 'optimization', label: 'Otimização', defaultTab: 'optimize',
    icon: <I d="M13 10V3L4 14h7v7l9-11h-7z" /> },
  { key: 'assistant', label: 'Assistente', defaultTab: 'assistant',
    icon: <I d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
]

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function Sidebar({
  page, activeTab, userName, isCollapsed, onToggleCollapse, onNavigate, onLogout, warningCount,
}: Props) {

  const activeSection = activeTab ? sectionForTab(activeTab) : (page === 'projects' ? 'projects' : 'design')

  /* ── Simple / Advanced mode toggle (#1) ───────────────────────────────── */
  const SIMPLE_SECTIONS: Section[] = ['projects', 'templates', 'design', 'geometry', 'assistant']
  const [mode, setMode] = useState<'simple' | 'advanced'>(() =>
    (localStorage.getItem('hpe_mode') as 'simple' | 'advanced') || 'simple'
  )
  const toggleMode = () => {
    const next = mode === 'simple' ? 'advanced' : 'simple'
    setMode(next)
    localStorage.setItem('hpe_mode', next)
  }

  /* ── Unexplored features counter (feature #3) ─────────────────────────── */
  const [visited, setVisited] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hpe_visited_tabs') || '[]')) } catch { return new Set() }
  })

  const handleClick = (item: SidebarItem) => {
    if (item.defaultTab) {
      setVisited(prev => {
        const next = new Set(prev)
        next.add(item.key)
        localStorage.setItem('hpe_visited_tabs', JSON.stringify([...next]))
        return next
      })
    }
    if (item.isPage === 'projects') {
      onNavigate('projects')
    } else if (item.defaultTab) {
      onNavigate('design', item.defaultTab)
    }
  }

  const totalSections = NAV_ITEMS.filter(i => i.key !== 'projects').length
  const unvisited = totalSections - visited.size

  // Show design items only when not on projects page, filter by mode
  const allItems = page === 'projects'
    ? NAV_ITEMS.filter(i => i.key === 'projects' || i.key === 'templates')
    : NAV_ITEMS
  const visibleItems = mode === 'simple' && page !== 'projects'
    ? allItems.filter(i => SIMPLE_SECTIONS.includes(i.key))
    : allItems

  return (
    <div className={`sidebar${isCollapsed ? ' collapsed' : ''}`}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="sidebar-header">
        <div className="logo-icon">H</div>
        {!isCollapsed && <span className="logo-text">HPE</span>}
        {!isCollapsed && unvisited > 0 && page === 'design' && (
          <span style={{
            marginLeft: 'auto', background: 'var(--accent)', color: '#fff',
            borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }} title={`${unvisited} secoes nao exploradas`}>{unvisited}</span>
        )}
      </div>

      {/* Simple / Advanced mode toggle */}
      {!isCollapsed && page === 'design' && (
        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
          <span style={{ color: mode === 'simple' ? 'var(--accent)' : 'var(--text-muted)' }}>Simples</span>
          <div onClick={toggleMode} style={{
            width: 32, height: 16, borderRadius: 8, cursor: 'pointer',
            background: mode === 'advanced' ? 'var(--accent)' : 'var(--border-primary)',
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: 6, background: '#fff',
              position: 'absolute', top: 2, transition: 'left 0.2s',
              left: mode === 'advanced' ? 18 : 2,
            }} />
          </div>
          <span style={{ color: mode === 'advanced' ? 'var(--accent)' : 'var(--text-muted)' }}>Avancado</span>
        </div>
      )}

      {/* ── Quick-access buttons (design mode only) ───────────────────── */}
      {page === 'design' && !isCollapsed && (
        <div style={{ display: 'flex', gap: 4, padding: '8px 8px 0' }}>
          {([
            { label: '3D', tab: '3d' as Tab },
            { label: 'Curvas', tab: 'curves' as Tab },
            { label: 'Otim.', tab: 'optimize' as Tab },
          ]).map(q => (
            <button
              key={q.tab}
              onClick={() => onNavigate('design', q.tab)}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 10, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                border: `1px solid ${activeTab === q.tab ? 'var(--accent)' : 'var(--border-primary)'}`,
                background: activeTab === q.tab ? 'rgba(0,160,223,0.15)' : 'transparent',
                color: activeTab === q.tab ? 'var(--accent)' : 'var(--text-muted)',
                fontFamily: 'var(--font-family)',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="sidebar-nav">
        {visibleItems.map(item => (
          <button
            key={item.key}
            className={`menu-item${activeSection === item.key ? ' active' : ''}`}
            onClick={() => handleClick(item)}
            title={isCollapsed ? item.label : undefined}
            style={{ position: 'relative' }}
          >
            <span className="icon">{item.icon}</span>
            {!isCollapsed && <span>{item.label}</span>}
            {item.key === 'design' && !!warningCount && warningCount > 0 && (
              <span style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: '#ef4444', color: '#fff', borderRadius: '50%',
                width: 16, height: 16, fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{warningCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="sidebar-footer" style={{ flexDirection: isCollapsed ? 'column' : 'row', gap: isCollapsed ? 8 : 10 }}>
        {!isCollapsed && (
          <>
            <div className="avatar">{userName.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{userName.length > 15 ? userName.slice(0, 15) + '...' : userName}</div>
              <div className="user-role" style={{ cursor: 'pointer' }} onClick={onLogout}>{t.logout}</div>
            </div>
            <LangSelector />
            <ThemeToggle />
          </>
        )}
        <button
          className="collapse-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          style={{
            width: isCollapsed ? 40 : undefined,
            height: isCollapsed ? 40 : undefined,
            borderRadius: isCollapsed ? 8 : undefined,
            background: isCollapsed ? 'var(--bg-surface)' : undefined,
            border: isCollapsed ? '1px solid var(--border-primary)' : undefined,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isCollapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
        {isCollapsed && <LangSelector />}
        {isCollapsed && <ThemeToggle />}
      </div>
    </div>
  )
}

/* ── Language Selector (flag buttons) ─────────────────────────────────────── */
function LangSelector() {
  const current = getCurrentLang()
  const langs: { key: LangKey; flag: string }[] = [
    { key: 'pt-br', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
    { key: 'en', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
    { key: 'es', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
  ]
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {langs.map(l => (
        <button
          key={l.key}
          onClick={() => { setLang(l.key); window.location.reload() }}
          title={l.key.toUpperCase()}
          style={{
            background: current === l.key ? 'var(--bg-surface)' : 'none',
            border: current === l.key ? '1px solid var(--border-primary)' : '1px solid transparent',
            borderRadius: 4, cursor: 'pointer', padding: '2px 4px',
            fontSize: 14, lineHeight: 1,
          }}
        >
          {l.flag}
        </button>
      ))}
    </div>
  )
}

/* ── Theme Toggle (dark / light / high-contrast) ─────────────────────────── */
const THEMES = ['dark', 'light', 'high-contrast'] as const
type Theme = typeof THEMES[number]

const THEME_LABELS: Record<Theme, string> = {
  dark: 'Escuro',
  light: 'Claro',
  'high-contrast': 'Alto Contraste',
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('hpe_theme') as Theme | null
    return saved && THEMES.includes(saved) ? saved : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('hpe_theme', theme)
  }, [theme])

  // Also set on mount
  useEffect(() => {
    const saved = localStorage.getItem('hpe_theme') as Theme | null
    if (saved && THEMES.includes(saved)) {
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  const nextTheme = () => {
    setTheme(prev => {
      const idx = THEMES.indexOf(prev)
      return THEMES[(idx + 1) % THEMES.length]
    })
  }

  return (
    <button
      onClick={nextTheme}
      title={THEME_LABELS[theme]}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {theme === 'dark' ? (
          /* Sun icon — clicking will go to light */
          <>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </>
        ) : theme === 'light' ? (
          /* Half-circle icon — clicking will go to high-contrast */
          <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.5" />
        ) : (
          /* Moon icon — clicking will go to dark */
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        )}
      </svg>
    </button>
  )
}
