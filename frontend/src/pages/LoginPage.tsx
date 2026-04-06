import React, { useState } from 'react'
import t from '../i18n'

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
    setLoading(true); setError(null)
    try {
      const endpoint = isRegister ? '/api/v1/auth/register' : '/api/v1/auth/login'
      const body = isRegister ? { email, password, name, company: company || undefined } : { email, password }
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || `Erro ${res.status}`) }
      const data = await res.json()
      localStorage.setItem('hpe_token', data.access_token)
      onLogin(data.user, data.access_token)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div style={{ width: 380, background: 'var(--bg-elevated)', borderRadius: 12, padding: 32, border: '1px solid var(--border-primary)', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ color: 'var(--accent)', fontSize: 22, margin: '0 0 4px' }}>{t.appName}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>{isRegister ? t.createAccount : t.signIn}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t.name}</span>
                <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} required />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t.company}</span>
                <input className="input" type="text" value={company} onChange={e => setCompany(e.target.value)} />
              </label>
            </>
          )}
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t.email}</span>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t.password}</span>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </label>

          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? t.pleaseWait : isRegister ? t.createAccountBtn : t.signInBtn}
          </button>

          {error && (
            <div style={{ marginTop: 12, padding: 8, background: 'rgba(239,68,68,0.15)', borderRadius: 4, color: 'var(--accent-danger)', fontSize: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => { setIsRegister(!isRegister); setError(null) }} style={{
            background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13,
          }}>
            {isRegister ? t.alreadyHaveAccount : t.noAccount}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => onLogin({ name: 'Dev User', email: 'dev@higra.com.br' }, '')} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
          }}>
            {t.skipLogin}
          </button>
        </div>
      </div>
    </div>
  )
}
