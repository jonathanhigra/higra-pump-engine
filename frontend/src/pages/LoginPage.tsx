import React, { useState } from 'react'

interface Props {
  onLogin: (user: any, token: string) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const endpoint = isRegister ? '/api/v1/auth/register' : '/api/v1/auth/login'
      const body = isRegister
        ? { email, password, name, company: company || undefined }
        : { email, password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Error ${res.status}`)
      }

      const data = await res.json()
      localStorage.setItem('hpe_token', data.access_token)
      onLogin(data.user, data.access_token)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #d0d0d0',
    borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f6f8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: 380, background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ color: '#2E8B57', fontSize: 22, margin: '0 0 4px' }}>Higra Pump Engine</h1>
          <p style={{ color: '#999', fontSize: 13, margin: 0 }}>{isRegister ? 'Create your account' : 'Sign in to your account'}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Name</span>
                <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} required />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Company</span>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)} style={inputStyle} />
              </label>
            </>
          )}

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} required />
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} required minLength={6} />
          </label>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 12, background: loading ? '#999' : '#2E8B57', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
          }}>
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>

          {error && (
            <div style={{ marginTop: 12, padding: 8, background: '#fde8e8', borderRadius: 4, color: '#c0392b', fontSize: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => { setIsRegister(!isRegister); setError(null) }} style={{
            background: 'none', border: 'none', color: '#2E8B57', cursor: 'pointer', fontSize: 13,
          }}>
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => onLogin({ name: 'Dev User', email: 'dev@higra.com.br' }, '')} style={{
            background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12,
          }}>
            Skip login (dev mode)
          </button>
        </div>
      </div>
    </div>
  )
}
