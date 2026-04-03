import React, { useState, useEffect } from 'react'
import t from '../i18n/pt-br'

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
  { key: 'geometry', label: 'Geometria', defaultTab: '3d',
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
  page, activeTab, userName, isCollapsed, onToggleCollapse, onNavigate, onLogout,
}: Props) {

  const activeSection = activeTab ? sectionForTab(activeTab) : (page === 'projects' ? 'projects' : 'design')

  const handleClick = (item: SidebarItem) => {
    if (item.isPage === 'projects') {
      onNavigate('projects')
    } else if (item.defaultTab) {
      onNavigate('design', item.defaultTab)
    }
  }

  // Show design items only when not on projects page
  const visibleItems = page === 'projects'
    ? NAV_ITEMS.filter(i => i.key === 'projects' || i.key === 'templates')
    : NAV_ITEMS

  return (
    <div className={`sidebar${isCollapsed ? ' collapsed' : ''}`}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="sidebar-header">
        <div className="logo-icon">H</div>
        {!isCollapsed && <span className="logo-text">HPE</span>}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="sidebar-nav">
        {visibleItems.map(item => (
          <button
            key={item.key}
            className={`menu-item${activeSection === item.key ? ' active' : ''}`}
            onClick={() => handleClick(item)}
            title={isCollapsed ? item.label : undefined}
          >
            <span className="icon">{item.icon}</span>
            {!isCollapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="sidebar-footer">
        <div className="avatar">{userName.charAt(0).toUpperCase()}</div>
        {!isCollapsed && (
          <div className="user-info">
            <div className="user-name">{userName.length > 15 ? userName.slice(0, 15) + '...' : userName}</div>
            <div className="user-role" style={{ cursor: 'pointer' }} onClick={onLogout}>{t.logout}</div>
          </div>
        )}
        <ThemeToggle />
        <button className="collapse-btn" onClick={onToggleCollapse} title={isCollapsed ? 'Expandir' : 'Recolher'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isCollapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ── Theme Toggle (sun/moon) ──────────────────────────────────────────────── */
function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('hpe_theme')
    return saved !== 'light'
  })

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('hpe_theme', theme)
  }, [isDark])

  // Also set on mount
  useEffect(() => {
    const saved = localStorage.getItem('hpe_theme')
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    }
  }, [])

  return (
    <button
      onClick={() => setIsDark(d => !d)}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isDark ? (
          /* Sun icon */
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
        ) : (
          /* Moon icon */
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        )}
      </svg>
    </button>
  )
}
