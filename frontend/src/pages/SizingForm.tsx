import React, { useState } from 'react'
import { runSizing, getCurves } from '../services/api'

interface Props {
  onResult: (sizing: any, curves: any[]) => void
  loading: boolean
  setLoading: (v: boolean) => void
}

export default function SizingForm({ onResult, loading, setLoading }: Props) {
  const [flowRate, setFlowRate] = useState('180')  // m3/h
  const [head, setHead] = useState('30')
  const [rpm, setRpm] = useState('1750')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const q = parseFloat(flowRate) / 3600  // m3/h to m3/s
      const h = parseFloat(head)
      const n = parseFloat(rpm)

      const [sizing, curves] = await Promise.all([
        runSizing(q, h, n),
        getCurves(q, h, n),
      ])

      onResult(sizing, curves.points)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #ccc',
    borderRadius: 4, fontSize: 14, boxSizing: 'border-box' as const,
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: '#f8f9fa', padding: 20, borderRadius: 8 }}>
      <h3 style={{ marginTop: 0, color: '#2E8B57' }}>Operating Point</h3>

      <label style={{ display: 'block', marginBottom: 15 }}>
        <span style={{ fontSize: 13, color: '#555' }}>Flow Rate [m3/h]</span>
        <input type="number" step="1" value={flowRate} onChange={e => setFlowRate(e.target.value)} style={inputStyle} />
      </label>

      <label style={{ display: 'block', marginBottom: 15 }}>
        <span style={{ fontSize: 13, color: '#555' }}>Head [m]</span>
        <input type="number" step="0.1" value={head} onChange={e => setHead(e.target.value)} style={inputStyle} />
      </label>

      <label style={{ display: 'block', marginBottom: 15 }}>
        <span style={{ fontSize: 13, color: '#555' }}>RPM</span>
        <input type="number" step="1" value={rpm} onChange={e => setRpm(e.target.value)} style={inputStyle} />
      </label>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '10px 20px', background: '#2E8B57', color: 'white',
          border: 'none', borderRadius: 4, fontSize: 16, cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Computing...' : 'Run Sizing'}
      </button>
    </form>
  )
}
