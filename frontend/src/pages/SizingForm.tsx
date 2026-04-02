import React, { useState } from 'react'
import t from '../i18n/pt-br'
import { runSizing, getCurves, getLossBreakdown, runStressAnalysis } from '../services/api'

interface Props {
  onResult: (sizing: any, curves: any[], losses: any, stress: any, op?: { flowRate: number; head: number; rpm: number }) => void
  loading: boolean
  setLoading: (v: boolean) => void
}

export default function SizingForm({ onResult, loading, setLoading }: Props) {
  const [flowRate, setFlowRate] = useState('180')
  const [head, setHead] = useState('30')
  const [rpm, setRpm] = useState('1750')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const q = parseFloat(flowRate) / 3600
      const h = parseFloat(head)
      const n = parseFloat(rpm)
      const [sizing, curvesData, lossData, stressData] = await Promise.all([
        runSizing(q, h, n),
        getCurves(q, h, n).catch(() => ({ points: [] })),
        getLossBreakdown(q, h, n).catch(() => null),
        runStressAnalysis(q, h, n).catch(() => null),
      ])
      onResult(sizing, curvesData.points || [], lossData, stressData, { flowRate: parseFloat(flowRate), head: h, rpm: n })
    } catch (err: any) { setError(err.message || 'Erro') } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 20 }}>
      <h3 style={{ marginTop: 0, color: 'var(--accent)', fontSize: 14, marginBottom: 16 }}>{t.operatingPoint}</h3>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t.flowRate}</span>
        <input className="input" type="number" step="1" value={flowRate} onChange={e => setFlowRate(e.target.value)} />
      </label>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t.head}</span>
        <input className="input" type="number" step="0.1" value={head} onChange={e => setHead(e.target.value)} />
      </label>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t.speed}</span>
        <input className="input" type="number" step="1" value={rpm} onChange={e => setRpm(e.target.value)} />
      </label>

      <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
        {loading ? t.computing : t.runSizing}
      </button>

      {error && (
        <div style={{ marginTop: 10, padding: 8, background: 'rgba(239,68,68,0.15)', borderRadius: 4, color: 'var(--accent-danger)', fontSize: 12 }}>
          {error}
        </div>
      )}
    </form>
  )
}
