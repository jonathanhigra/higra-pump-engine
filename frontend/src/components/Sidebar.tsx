import React from 'react'
import t from '../i18n/pt-br'

type Tab = 'results' | 'curves' | '3d' | 'velocity' | 'losses' | 'stress' | 'compare' | 'assistant' | 'optimize' | 'loading' | 'pressure' | 'multispeed' | 'meridional-editor' | 'spanwise'

interface Props {
  page: 'projects' | 'design'
  activeTab: Tab | null
  userName: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onNavigate: (page: 'projects' | 'design', tab?: Tab) => void
  onLogout: () => void
}

interface NavItem {
  key: string
  label: string
  icon: React.ReactNode
  tab?: Tab
  page?: 'projects' | 'design'
}

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24"><path d={d} /></svg>
)

export default function Sidebar({ page, activeTab, userName, isCollapsed, onToggleCollapse, onNavigate, onLogout }: Props) {

  const projectsItem: NavItem = {
    key: 'projects', label: t.navProjects, page: 'projects',
    icon: <I d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />,
  }

  const designItems: NavItem[] = [
    { key: 'results', label: t.tabSizing, tab: 'results',
      icon: <I d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /> },
    { key: 'curves', label: t.tabCurves, tab: 'curves',
      icon: <I d="M3 12h4l3-9 4 18 3-9h4" /> },
    { key: '3d', label: t.tab3d, tab: '3d',
      icon: <I d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /> },
    { key: 'velocity', label: t.tabVelocity, tab: 'velocity',
      icon: <I d="M13 17l5-5-5-5M6 17l5-5-5-5" /> },
    { key: 'losses', label: t.tabLosses, tab: 'losses',
      icon: <I d="M12 20V10M18 20V4M6 20v-4" /> },
    { key: 'stress', label: t.tabStress, tab: 'stress',
      icon: <I d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> },
    { key: 'compare', label: t.tabCompare, tab: 'compare',
      icon: <I d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /> },
    { key: 'optimize', label: 'Otimização', tab: 'optimize',
      icon: <I d="M13 10V3L4 14h7v7l9-11h-7z" /> },
    { key: 'assistant', label: t.tabAssistant, tab: 'assistant',
      icon: <I d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
    { key: 'loading', label: t.tabLoading, tab: 'loading',
      icon: <I d="M4 6h16M4 12h8m-8 6h16" /> },
    { key: 'pressure', label: t.tabPressure, tab: 'pressure',
      icon: <I d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" /> },
    { key: 'multispeed', label: t.tabMultiSpeed, tab: 'multispeed',
      icon: <I d="M13 10V3L4 14h7v7l9-11h-7z" /> },
    { key: 'meridional-editor', label: t.tabMeridionalEditor, tab: 'meridional-editor',
      icon: <I d="M12 20V10M6 20V4M18 20v-4" /> },
    { key: 'spanwise', label: t.tabSpanwise, tab: 'spanwise',
      icon: <I d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /> },
  ]

  const handleClick = (item: NavItem) => {
    if (item.page === 'projects') {
      onNavigate('projects')
    } else if (item.tab) {
      onNavigate('design', item.tab)
    }
  }

  const isActive = (item: NavItem) => {
    if (item.page === 'projects') return page === 'projects'
    return page === 'design' && activeTab === item.tab
  }

  return (
    <div className={`sidebar${isCollapsed ? ' collapsed' : ''}`}>
      {/* Header / Logo */}
      <div className="sidebar-header">
        <div className="logo-icon">H</div>
        {!isCollapsed && <span className="logo-text">HPE</span>}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {/* Projetos */}
        <button
          className={`menu-item${isActive(projectsItem) ? ' active' : ''}`}
          onClick={() => handleClick(projectsItem)}
          title={isCollapsed ? projectsItem.label : undefined}
        >
          <span className="icon">{projectsItem.icon}</span>
          {!isCollapsed && <span>{projectsItem.label}</span>}
        </button>

        {/* Divider: Design tabs */}
        {page === 'design' && (
          <>
            {!isCollapsed && <div className="sidebar-section-label">{t.navCurrentProject}</div>}
            {designItems.map(item => (
              <button
                key={item.key}
                className={`menu-item${isActive(item) ? ' active' : ''}`}
                onClick={() => handleClick(item)}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="icon">{item.icon}</span>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="avatar">{userName.charAt(0).toUpperCase()}</div>
        {!isCollapsed && (
          <div className="user-info">
            <div className="user-name">{userName.length > 15 ? userName.slice(0, 15) + '...' : userName}</div>
            <div className="user-role" style={{ cursor: 'pointer' }} onClick={onLogout}>{t.logout}</div>
          </div>
        )}
        <button className="collapse-btn" onClick={onToggleCollapse} title={isCollapsed ? 'Expandir' : 'Recolher'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isCollapsed
              ? <path d="M9 18l6-6-6-6" />
              : <path d="M15 18l-6-6 6-6" />
            }
          </svg>
        </button>
      </div>
    </div>
  )
}
