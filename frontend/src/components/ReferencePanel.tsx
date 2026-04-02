import React, { useState } from 'react'

interface Props {
  sizing: any
}

export default function ReferencePanel({ sizing }: Props) {
  const [ref, setRef] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const compare = async () => {
    setLoading(true)
    try {
      const nq = sizing.specific_speed_nq
      const res = await fetch(`/api/v1/sizing/reference_geometry?nq=${nq}`)
      setRef(await res.json())
    } finally { setLoading(false) }
  }

  const diff = (actual: number, ref: number) => {
    if (!ref) return null
    const pct = Math.abs(actual - ref) / ref * 100
    if (pct <= 10) return '#4caf50'
    if (pct <= 20) return '#FFD54F'
    return '#ff9800'
  }

  const compRow = (label: string, actual: number, refVal: number, fmt: (v: number) => string) => {
    const color = diff(actual, refVal)
    return (
      <tr key={label}>
        <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)' }}>{label}</td>
        <td style={{ padding: '5px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(actual)}</td>
        <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(refVal)}</td>
        <td style={{ padding: '5px 8px' }}>
          {color && (
            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: color + '20', color }}>
              {((actual - refVal) / refVal * 100).toFixed(0)}%
            </span>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={compare}
        disabled={loading}
        style={{
          fontSize: 12, padding: '6px 14px', borderRadius: 6,
          border: '1px solid var(--border-primary)', background: 'transparent',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
      >
        {loading ? 'Carregando...' : '\uD83D\uDCCA Comparar com Referência (Gülich/Stepanoff)'}
      </button>

      {ref && (
        <div style={{
          marginTop: 10, background: 'var(--bg-surface)', borderRadius: 6,
          border: '1px solid var(--border-primary)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border-primary)',
            fontSize: 11, color: 'var(--text-muted)',
          }}>
            Referência: {ref.source} · Nq {ref.nq_min}–{ref.nq_max}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Parâmetro', 'Calculado', 'Referência', 'Δ'].map(h => (
                  <th key={h} style={{
                    padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)',
                    textAlign: 'left', fontWeight: 500,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compRow('D1/D2', sizing.impeller_d1 / sizing.impeller_d2, ref.d1_d2, v => v.toFixed(3))}
              {compRow('b2/D2', sizing.impeller_b2 / sizing.impeller_d2, ref.b2_d2, v => v.toFixed(3))}
              {compRow('β2 [°]', sizing.beta2, ref.beta2_deg, v => v.toFixed(1))}
              {compRow('Z (pás)', sizing.blade_count, ref.blade_count, v => v.toFixed(0))}
              {compRow('η best [%]', sizing.estimated_efficiency * 100, ref.eta_best * 100, v => v.toFixed(1))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
