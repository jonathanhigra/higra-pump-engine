import React, { useState, useEffect } from 'react'
import t from '../i18n'
import TemplateSelector, { TEMPLATES, type Template } from '../components/TemplateSelector'

interface Project {
  id: string; name: string; description: string | null
  machine_type: string; created_at: string; n_sizing_results: number
  color?: string
}

interface TemplateOpPoint {
  flowRate: number
  head: number
  rpm: number
  machine_type: string
}

interface Props {
  onSelectProject: (project: Project | null, templateOp?: TemplateOpPoint) => void
  token: string
}

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  } catch { return '' }
}

const actionBtnStyle: React.CSSProperties = {
  padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
  background: 'var(--bg-surface)', color: 'var(--accent)',
  border: '1px solid var(--accent)', fontFamily: 'var(--font-family)', fontWeight: 500,
}

// #15 — machine type SVG thumbnail
function MachineThumbnail({ machineType, color = 'var(--accent)' }: { machineType: string; color?: string }) {
  const size = 42
  if (machineType === 'axial_pump' || machineType === 'axial_fan') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6">
        <circle cx="24" cy="24" r="4" fill={color} fillOpacity="0.3" />
        {[0, 90, 180, 270].map(a => {
          const r = a * Math.PI / 180
          const mx = 24 + 18 * Math.cos(r + 0.4), my = 24 + 18 * Math.sin(r + 0.4)
          return <path key={a} d={`M24 24 Q${(24 + 14 * Math.cos(r) - 6 * Math.sin(r)).toFixed(0)} ${(24 + 14 * Math.sin(r) + 6 * Math.cos(r)).toFixed(0)} ${mx.toFixed(0)} ${my.toFixed(0)}`} />
        })}
      </svg>
    )
  }
  // Default: centrifugal radial impeller
  const blades = 6
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6">
      <circle cx="24" cy="24" r="18" />
      <circle cx="24" cy="24" r="7" />
      {Array.from({ length: blades }).map((_, i) => {
        const a1 = (i / blades) * 2 * Math.PI
        const a2 = a1 + 0.6
        const x1 = 24 + 8 * Math.cos(a1), y1 = 24 + 8 * Math.sin(a1)
        const x2 = 24 + 17 * Math.cos(a2), y2 = 24 + 17 * Math.sin(a2)
        return <path key={i} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} Q${((x1 + x2) / 2 - 2 * Math.sin(a1)).toFixed(1)} ${((y1 + y2) / 2 + 2 * Math.cos(a1)).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`} />
      })}
    </svg>
  )
}

export default function ProjectsPage({ onSelectProject, token }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [machineType, setMachineType] = useState('centrifugal_pump')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const PROJECT_COLORS = ['#00a0df', '#22c55e', '#a855f7', '#ef4444', '#f59e0b', '#06b6d4']
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[0])
  // #19 — search
  const [search, setSearch] = useState('')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const loadProjects = async () => {
    try { const r = await fetch('/api/v1/projects', { headers }); if (r.ok) setProjects(await r.json()) } catch {}
  }
  useEffect(() => { loadProjects() }, [])

  const renameProject = async (id: string, newName: string) => {
    if (!newName.trim()) return
    try {
      await fetch(`/api/v1/projects/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ name: newName.trim() }),
      })
      loadProjects()
    } catch {}
  }

  const deleteProject = async (project: Project) => {
    setDeleting(true)
    try {
      const r = await fetch(`/api/v1/projects/${project.id}`, { method: 'DELETE', headers })
      if (r.ok || r.status === 204) {
        setProjects(prev => prev.filter(p => p.id !== project.id))
        setConfirmDelete(null)
      }
    } finally { setDeleting(false) }
  }

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setLoading(true)
    try {
      const r = await fetch('/api/v1/projects', { method: 'POST', headers, body: JSON.stringify({ name, description: description || undefined, machine_type: machineType }) })
      if (r.ok) {
        const newProject = await r.json()
        setName(''); setDescription(''); setShowCreate(false); setMachineType('centrifugal_pump')
        const tpl = selectedTemplate
        setSelectedTemplate(null); setShowTemplates(false)
        // If a template was selected, open project immediately with its operating point
        if (tpl) {
          onSelectProject(newProject, {
            flowRate: tpl.flow_rate_m3h,
            head: tpl.head_m,
            rpm: tpl.rpm,
            machine_type: tpl.machine_type,
          })
        } else {
          loadProjects()
        }
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header with actions — shown when projects exist */}
      {projects.length > 0 && (
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2 style={{ color: 'var(--text-primary)', margin: '0 0 4px', fontSize: 20 }}>Seus Projetos</h2>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                {projects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase())).length} de {projects.length} · Selecione para continuar
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCreate(!showCreate)} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
                + Novo Projeto
              </button>
              <button onClick={() => onSelectProject(null)} style={{
                padding: '8px 16px', background: 'transparent', color: 'var(--accent)',
                border: '1px solid var(--accent)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                fontFamily: 'var(--font-family)', fontWeight: 500,
              }}>
                Projeto Rápido
              </button>
            </div>
          </div>
          {/* #19 — search bar */}
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Buscar projetos..." value={search} onChange={e => setSearch(e.target.value)} className="input"
              style={{ paddingLeft: 32, fontSize: 13, width: '100%' }} />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={(e) => {
          createProject(e).then(() => {
            if (name.trim()) localStorage.setItem(`hpe_project_color_${name.trim()}`, projectColor)
          })
        }} className="card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>Novo Projeto</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="input" placeholder="Nome do projeto" value={name} onChange={e => setName(e.target.value)} required autoFocus />
            <input className="input" placeholder="Descrição (opcional)" value={description} onChange={e => setDescription(e.target.value)} />

            {/* Machine type pills */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Tipo de máquina</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { value: 'centrifugal_pump', label: 'Bomba Centrífuga' },
                  { value: 'francis_turbine', label: 'Turbina Francis' },
                  { value: 'axial_fan', label: 'Ventilador Axial' },
                  { value: 'centrifugal_compressor', label: 'Compressor' },
                ].map(mt => (
                  <button key={mt.value} type="button"
                    onClick={() => setMachineType(mt.value)}
                    style={{
                      padding: '5px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${machineType === mt.value ? 'var(--accent)' : 'var(--border-primary)'}`,
                      background: machineType === mt.value ? 'rgba(0,160,223,0.12)' : 'transparent',
                      color: machineType === mt.value ? 'var(--accent)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-family)', fontWeight: 500,
                    }}>{mt.label}</button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cor:</span>
              {PROJECT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setProjectColor(c)}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c,
                    border: projectColor === c ? '2px solid #fff' : '2px solid transparent',
                    outline: projectColor === c ? `2px solid ${c}` : 'none',
                    cursor: 'pointer', padding: 0, flexShrink: 0,
                  }}
                />
              ))}
            </div>

            {/* Templates toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowTemplates(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: '1px solid var(--border-primary)',
                  borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                  fontSize: 12, color: selectedTemplate ? 'var(--accent)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-family)',
                  borderColor: selectedTemplate ? 'var(--accent)' : 'var(--border-primary)',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
                {selectedTemplate ? `Template: ${selectedTemplate.name}` : 'Usar template (opcional)'}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, transform: showTemplates ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {selectedTemplate && (
                <button type="button" onClick={() => setSelectedTemplate(null)}
                  style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-family)' }}>
                  ✕ limpar
                </button>
              )}
            </div>

            {showTemplates && (
              <div style={{
                border: '1px solid var(--border-primary)', borderRadius: 8,
                padding: 16, background: 'var(--bg-surface)',
                maxHeight: 400, overflowY: 'auto',
              }}>
                <TemplateSelector
                  machineTypeFilter={machineType}
                  onSelect={(params) => {
                    const tpl = TEMPLATES.find(
                      t => t.flow_rate_m3h === params.flow_rate && t.head_m === params.head && t.rpm === params.rpm
                    )
                    if (tpl) {
                      setSelectedTemplate(tpl)
                      if (!name.trim()) setName(tpl.name)
                      setMachineType(tpl.machine_type)
                    }
                    setShowTemplates(false)
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '8px 20px', fontSize: 13 }}>
                {loading ? 'Criando...' : selectedTemplate ? `Criar com "${selectedTemplate.name}"` : 'Criar'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setSelectedTemplate(null); setShowTemplates(false) }} style={{
                padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-primary)',
                color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                fontFamily: 'var(--font-family)',
              }}>Cancelar</button>
            </div>
          </div>
        </form>
      )}

      {/* Empty state — #8 enhanced with template cards */}
      {projects.length === 0 && !showCreate && (
        <div style={{ maxWidth: 760, margin: '0 auto', paddingTop: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: 12 }}>
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
            <h2 style={{ color: 'var(--text-primary)', margin: '0 0 6px', fontSize: 20 }}>Comece seu primeiro projeto</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              Escolha um ponto de partida rápido ou crie do zero
            </p>
          </div>
          {/* Template starter cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Bomba de Irrigação', desc: 'Q=120 m³/h · H=18m · n=1150rpm', q: 120, h: 18, n: 1150, color: '#22c55e' },
              { label: 'Bomba Industrial', desc: 'Q=300 m³/h · H=32m · n=1750rpm', q: 300, h: 32, n: 1750, color: '#00a0df' },
              { label: 'Alta Pressão', desc: 'Q=50 m³/h · H=80m · n=2900rpm', q: 50, h: 80, n: 2900, color: '#a855f7' },
            ].map(tmpl => (
              <button key={tmpl.label} type="button"
                onClick={() => onSelectProject(null, { flowRate: tmpl.q, head: tmpl.h, rpm: tmpl.n, machine_type: 'centrifugal_pump' })}
                style={{
                  padding: '18px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  background: 'var(--card-bg)', border: `1px solid ${tmpl.color}35`,
                  borderTop: `3px solid ${tmpl.color}`, fontFamily: 'var(--font-family)',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${tmpl.color}22` }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ marginBottom: 10 }}>
                  <MachineThumbnail machineType="centrifugal_pump" color={tmpl.color} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{tmpl.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{tmpl.desc}</div>
                <div style={{ fontSize: 11, color: tmpl.color, fontWeight: 600 }}>Calcular agora →</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ padding: '10px 24px', fontSize: 13 }}>
              + Criar Projeto Personalizado
            </button>
            <button onClick={() => onSelectProject(null)} style={{
              padding: '10px 24px', background: 'transparent', color: 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-family)', fontWeight: 500,
            }}>
              Projeto Rápido (sem salvar)
            </button>
          </div>

          {/* Video tutorial placeholder */}
          <div style={{
            marginTop: 24, padding: 20, background: 'var(--bg-surface)', borderRadius: 8,
            border: '1px solid var(--border-primary)', textAlign: 'center',
            width: '100%', maxWidth: 480,
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ opacity: 0.5, marginBottom: 8 }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Como projetar uma bomba em 3 minutos
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Tutorial em video -- em breve
            </div>
          </div>
        </div>
      )}

      {/* Project cards */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects
            .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase()))
            .map(p => {
            const pColor = p.color || localStorage.getItem(`hpe_project_color_${p.name}`) || 'var(--accent)'
            return (
              <div key={p.id} onClick={() => {
                document.documentElement.style.setProperty('--accent', pColor)
                onSelectProject(p)
              }} className="card" style={{
                cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s',
                padding: 16, display: 'flex', gap: 16, alignItems: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.transform = 'none' }}
              >
                {/* Left: Color bar + #15 machine thumbnail */}
                <div style={{
                  width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                  background: `${pColor}18`, border: `1px solid ${pColor}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MachineThumbnail machineType={p.machine_type} color={pColor} />
                </div>

                {/* Middle: Name + description + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === p.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => { renameProject(p.id, editName); setEditingId(null) }}
                      onKeyDown={e => { if (e.key === 'Enter') { renameProject(p.id, editName); setEditingId(null) } if (e.key === 'Escape') setEditingId(null) }}
                      className="input"
                      style={{ fontSize: 15, fontWeight: 600, padding: '2px 6px', width: '100%' }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <h3 onDoubleClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditName(p.name) }}
                      style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)', fontWeight: 600, cursor: 'text' }}
                      title="Duplo-clique para renomear">
                      {p.name}
                    </h3>
                  )}
                  {p.description && <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.description}</p>}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>{p.n_sizing_results || 0} designs</span>
                    <span>•</span>
                    <span>{p.machine_type?.replace('_', ' ') || 'bomba centrífuga'}</span>
                    <span>•</span>
                    <span>{formatDate(p.created_at)}</span>
                  </div>
                </div>

                {/* Right: Quick actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => onSelectProject(p)} title="Abrir" style={actionBtnStyle}>Abrir</button>
                  <button
                    onClick={() => setConfirmDelete(p)}
                    title="Excluir projeto"
                    style={{
                      ...actionBtnStyle,
                      color: '#ef4444',
                      borderColor: 'rgba(239,68,68,0.4)',
                      background: 'transparent',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => !deleting && setConfirmDelete(null)}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
            borderRadius: 12, padding: 28, maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            {/* Icon */}
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
              Excluir projeto?
            </h3>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>"{confirmDelete.name}"</strong> será excluído permanentemente.
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              Todos os designs e curvas de desempenho associados serão removidos. Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                style={{
                  flex: 1, padding: '10px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--border-primary)', background: 'transparent',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-family)',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteProject(confirmDelete)}
                disabled={deleting}
                style={{
                  flex: 1, padding: '10px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #ef4444', background: '#ef4444',
                  color: '#fff', fontFamily: 'var(--font-family)', fontWeight: 600,
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
