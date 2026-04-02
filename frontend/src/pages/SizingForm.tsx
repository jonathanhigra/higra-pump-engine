import React, { useState } from 'react'
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
    e.preventDefault()
    setLoading(true)
    setError(null)

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
    } catch (err: any) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #d0d0d0',
    borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
    outline: 'none', transition: 'border-color 0.15s',
  }

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 14 }
  const spanStyle: React.CSSProperties = { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }

  return (
    <form onSubmit={handleSubmit} style={{ background: '#f8f9fa', padding: 20, borderRadius: 8, border: '1px solid #e8e8e8' }}>
      <h3 style={{ marginTop: 0, color: '#2E8B57', fontSize: 15, marginBottom: 18 }}>Operating Point</h3>

      <label style={labelStyle}>
        <span style={spanStyle}>Flow Rate Q [m3/h]</span>
        <input type="number" step="1" value={flowRate} onChange={e => setFlowRate(e.target.value)} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        <span style={spanStyle}>Head H [m]</span>
        <input type="number" step="0.1" value={head} onChange={e => setHead(e.target.value)} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        <span style={spanStyle}>Speed n [rpm]</span>
        <input type="number" step="1" value={rpm} onChange={e => setRpm(e.target.value)} style={inputStyle} />
      </label>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '10px 20px', background: loading ? '#999' : '#2E8B57', color: '#fff',
          border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer', transition: 'background 0.15s',
        }}
      >
        {loading ? 'Computing...' : 'Run Sizing'}
      </button>

      {error && (
        <div style={{ marginTop: 10, padding: 8, background: '#fde8e8', borderRadius: 4, color: '#c0392b', fontSize: 12 }}>
          {error}
        </div>
      )}
    </form>
  )
}
