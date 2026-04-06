import React, { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onResult: (q: number, h: number, n: number) => void
}

export default function ReverseCalc({ open, onClose, onResult }: Props) {
  const [d2, setD2] = useState('280')
  const [h, setH] = useState('32')
  const [n, setN] = useState('1750')
  const [result, setResult] = useState<{ q: number; nq: number } | null>(null)

  const calculate = () => {
    const D2 = parseFloat(d2) / 1000 // mm to m
    const H = parseFloat(h)
    const N = parseFloat(n)
    // From D2 = k * (Q/N)^0.5 * H^0.25, solve for Q
    // k ~ 4.5 for centrifugal pumps
    const k = 4.5
    const Q = ((D2 * N) / (k * Math.pow(H, 0.25))) ** 2 // m^3/s
    const Nq = N * Math.sqrt(Q) / Math.pow(H, 0.75)
    setResult({ q: Q * 3600, nq: Nq })
  }

  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
        borderRadius: 10, padding: 20, width: 340,
      }}>
        <h4 style={{ color: 'var(--accent)', margin: '0 0 12px', fontSize: 14 }}>Cálculo Reverso</h4>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Dado D2 desejado, calcula a vazão necessária.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            D2 desejado [mm]
            <input className="input" type="number" value={d2} onChange={e => setD2(e.target.value)} style={{ marginTop: 2 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Altura H [m]
            <input className="input" type="number" value={h} onChange={e => setH(e.target.value)} style={{ marginTop: 2 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Rotação n [rpm]
            <input className="input" type="number" value={n} onChange={e => setN(e.target.value)} style={{ marginTop: 2 }} />
          </label>
        </div>
        <button className="btn-primary" onClick={calculate} style={{ width: '100%', marginTop: 12, padding: 8, fontSize: 13 }}>
          Calcular Vazão
        </button>
        {result && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-surface)', borderRadius: 6, fontSize: 13 }}>
            <div>Vazão estimada: <b style={{ color: 'var(--accent)' }}>{result.q.toFixed(1)} m³/h</b></div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Nq ~ {result.nq.toFixed(1)}</div>
            <button
              onClick={() => { onResult(result.q, parseFloat(h), parseFloat(n)); onClose() }}
              style={{
                marginTop: 8, padding: '4px 12px', fontSize: 11, background: 'transparent',
                border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer',
              }}
            >
              Usar estes valores
            </button>
          </div>
        )}
        <button
          onClick={onClose}
          style={{
            marginTop: 8, width: '100%', padding: 6, fontSize: 12,
            background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)',
            borderRadius: 4, cursor: 'pointer',
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
