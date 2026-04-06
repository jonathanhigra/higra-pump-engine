import React, { useState, useEffect } from 'react'
import t from '../i18n'

interface Project {
  id: string; name: string; description: string | null
  machine_type: string; created_at: string; n_sizing_results: number
  color?: string
}

interface Props {
  onSelectProject: (project: Project | null) => void
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

export default function ProjectsPage({ onSelectProject, token }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [machineType, setMachineType] = useState('centrifugal_pump')
  const PROJECT_COLORS = ['#00a0df', '#22c55e', '#a855f7', '#ef4444', '#f59e0b', '#06b6d4']
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[0])

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const loadProjects = async () => {
    try { const r = await fetch('/api/v1/projects', { headers }); if (r.ok) setProjects(await r.json()) } catch {}
  }
  useEffect(() => { loadProjects() }, [])

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setLoading(true)
    try {
      const r = await fetch('/api/v1/projects', { method: 'POST', headers, body: JSON.stringify({ name, description: description || undefined, machine_type: machineType }) })
      if (r.ok) { setName(''); setDescription(''); setShowCreate(false); setMachineType('centrifugal_pump'); loadProjects() }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header with actions — shown when projects exist */}
      {projects.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)', margin: '0 0 4px', fontSize: 20 }}>Seus Projetos</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {projects.length} projeto{projects.length !== 1 ? 's' : ''} · Selecione para continuar
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

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '8px 20px', fontSize: 13 }}>
                {loading ? 'Criando...' : 'Criar'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{
                padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-primary)',
                color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                fontFamily: 'var(--font-family)',
              }}>Cancelar</button>
            </div>
          </div>
        </form>
      )}

      {/* Empty state */}
      {projects.length === 0 && !showCreate && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 16 }}>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <h2 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 20 }}>Comece seu primeiro projeto</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Dimensione rotores de bombas centrífugas, turbinas Francis e ventiladores — com geometria 3D, análise de perdas e otimização.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ padding: '12px 28px', fontSize: 14 }}>
              + Criar Projeto
            </button>
            <button onClick={() => onSelectProject(null)} style={{
              padding: '12px 28px', background: 'transparent', color: 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: 6, cursor: 'pointer', fontSize: 14,
              fontFamily: 'var(--font-family)', fontWeight: 500,
            }}>
              Projeto Rápido (sem salvar)
            </button>
          </div>
        </div>
      )}

      {/* Project cards */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map(p => {
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
                {/* Left: Color bar + icon */}
                <div style={{
                  width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                  background: `linear-gradient(135deg, ${pColor}, ${pColor}88)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                  </svg>
                </div>

                {/* Middle: Name + description + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>{p.name}</h3>
                  {p.description && <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.description}</p>}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>{p.n_sizing_results || 0} versões</span>
                    <span>•</span>
                    <span>{p.machine_type?.replace('_', ' ') || 'bomba centrífuga'}</span>
                    <span>•</span>
                    <span>{formatDate(p.created_at)}</span>
                  </div>
                </div>

                {/* Right: Quick actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => onSelectProject(p)} title="Abrir" style={actionBtnStyle}>Abrir</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
