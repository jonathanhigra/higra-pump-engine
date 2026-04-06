import React, { useState, useEffect } from 'react'
import t from '../i18n'

interface Project {
  id: string; name: string; description: string | null
  machine_type: string; created_at: string; n_sizing_results: number
}

interface Props {
  onSelectProject: (project: Project | null) => void
  token: string
}

export default function ProjectsPage({ onSelectProject, token }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const loadProjects = async () => {
    try { const r = await fetch('/api/v1/projects', { headers }); if (r.ok) setProjects(await r.json()) } catch {}
  }
  useEffect(() => { loadProjects() }, [])

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setLoading(true)
    try {
      const r = await fetch('/api/v1/projects', { method: 'POST', headers, body: JSON.stringify({ name, description: description || undefined }) })
      if (r.ok) { setName(''); setDescription(''); setShowCreate(false); loadProjects() }
    } finally { setLoading(false) }
  }

  const outlineBtn: React.CSSProperties = {
    padding: '10px 24px', background: 'transparent', color: 'var(--accent)',
    border: '1px solid var(--accent)', borderRadius: 6, cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-family)',
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Hero banner — full when 0 projects, compact when projects exist */}
      {projects.length === 0 ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,160,223,0.08) 0%, rgba(0,80,120,0.08) 100%)',
          border: '1px solid rgba(0,160,223,0.2)',
          borderRadius: 12, padding: '32px 28px', marginBottom: 24, textAlign: 'center',
        }}>
          <h2 style={{ color: 'var(--accent)', margin: '0 0 8px', fontSize: 22 }}>
            Projete rotores de turbomaquinas em minutos
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px' }}>
            Dimensionamento 1D, geometria 3D, analise de perdas e otimizacao — tudo na web.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => onSelectProject(null)} style={{ padding: '10px 24px' }}>
              Projeto Rapido
            </button>
            <button style={{...outlineBtn}} onClick={() => onSelectProject(null)}>
              Ver Templates
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,160,223,0.05) 0%, rgba(0,80,120,0.05) 100%)',
          border: '1px solid rgba(0,160,223,0.12)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Dimensionamento 1D, geometria 3D, analise e otimizacao — tudo na web.
          </span>
          <button className="btn-primary" onClick={() => onSelectProject(null)}
            style={{ padding: '5px 14px', fontSize: 12 }}>
            Projeto Rapido
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 20 }}>{t.projects}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
            {t.newProject}
          </button>
          <button onClick={() => onSelectProject(null)} style={{
            padding: '8px 16px', background: 'var(--bg-surface)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            {t.quickDesign}
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={createProject} className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="input" placeholder={t.projectName} value={name} onChange={e => setName(e.target.value)} required />
          <input className="input" placeholder={t.descriptionOptional} value={description} onChange={e => setDescription(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={loading} style={{ alignSelf: 'flex-start', padding: '8px 20px', fontSize: 13 }}>
            {loading ? t.creating : t.create}
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t.noProjectsYet}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map(p => (
            <div key={p.id} onClick={() => onSelectProject(p)} className="card" style={{
              cursor: 'pointer', transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-border)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>{p.name}</h3>
                  {p.description && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{p.description}</p>}
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                  <div>{p.n_sizing_results} {t.designs}</div>
                  <div>{p.machine_type.replace('_', ' ')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
