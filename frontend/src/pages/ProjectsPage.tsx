import React, { useState, useEffect } from 'react'

interface Project {
  id: string
  name: string
  description: string | null
  machine_type: string
  created_at: string
  n_sizing_results: number
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
    try {
      const res = await fetch('/api/v1/projects', { headers })
      if (res.ok) setProjects(await res.json())
    } catch { /* ignore */ }
  }

  useEffect(() => { loadProjects() }, [])

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST', headers,
        body: JSON.stringify({ name, description: description || undefined }),
      })
      if (res.ok) {
        setName('')
        setDescription('')
        setShowCreate(false)
        loadProjects()
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: '#2E8B57', margin: 0 }}>Projects</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCreate(!showCreate)} style={{
            padding: '8px 16px', background: '#2E8B57', color: '#fff', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            + New Project
          </button>
          <button onClick={() => onSelectProject(null)} style={{
            padding: '8px 16px', background: '#eee', color: '#333', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            Quick Design
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={createProject} style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <input type="text" placeholder="Project name" value={name} onChange={e => setName(e.target.value)} required
            style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, marginBottom: 8, boxSizing: 'border-box' }} />
          <input type="text" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, marginBottom: 8, boxSizing: 'border-box' }} />
          <button type="submit" disabled={loading} style={{
            padding: '8px 20px', background: '#2E8B57', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
          }}>
            {loading ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#bbb' }}>
          <p>No projects yet. Create one or use Quick Design.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map(p => (
            <div key={p.id} onClick={() => onSelectProject(p)} style={{
              padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8',
              cursor: 'pointer', transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{p.name}</h3>
                  {p.description && <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{p.description}</p>}
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: '#999' }}>
                  <div>{p.n_sizing_results} designs</div>
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
