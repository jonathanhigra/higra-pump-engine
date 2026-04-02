import React, { useState } from 'react'
import { runSizing } from '../services/api'
import t from '../i18n/pt-br'
import type { SizingResult } from '../App'

interface DesignEntry { label: string; flowRate: number; head: number; rpm: number; result: SizingResult | null }

export default function DesignComparison() {
  const [designs, setDesigns] = useState<DesignEntry[]>([
    { label: 'Projeto A', flowRate: 180, head: 30, rpm: 1750, result: null },
    { label: 'Projeto B', flowRate: 180, head: 30, rpm: 2900, result: null },
  ])
  const [loading, setLoading] = useState(false)

  const runAll = async () => {
    setLoading(true)
    const updated = await Promise.all(designs.map(async d => {
      try { return { ...d, result: await runSizing(d.flowRate / 3600, d.head, d.rpm) } } catch { return { ...d, result: null } }
    }))
    setDesigns(updated); setLoading(false)
  }

  const update = (i: number, f: string, v: string) => {
    const c = [...designs]; (c[i] as any)[f] = f === 'label' ? v : parseFloat(v) || 0; c[i].result = null; setDesigns(c)
  }
  const addDesign = () => { if (designs.length >= 4) return; setDesigns([...designs, { label: `Projeto ${String.fromCharCode(65 + designs.length)}`, flowRate: 180, head: 30, rpm: 1750, result: null }]) }
  const hasResults = designs.some(d => d.result)

  const rows: { label: string; key: string; fmt: (r: SizingResult) => string }[] = [
    { label: 'Nq', key: 'nq', fmt: r => r.specific_speed_nq.toFixed(1) },
    { label: 'D2 [mm]', key: 'd2', fmt: r => (r.impeller_d2 * 1000).toFixed(1) },
    { label: 'D1 [mm]', key: 'd1', fmt: r => (r.impeller_d1 * 1000).toFixed(1) },
    { label: 'b2 [mm]', key: 'b2', fmt: r => (r.impeller_b2 * 1000).toFixed(1) },
    { label: t.blades, key: 'z', fmt: r => `${r.blade_count}` },
    { label: 'β1 [°]', key: 'b1a', fmt: r => r.beta1.toFixed(1) },
    { label: 'β2 [°]', key: 'b2a', fmt: r => r.beta2.toFixed(1) },
    { label: `${t.efficiency} [%]`, key: 'eta', fmt: r => (r.estimated_efficiency * 100).toFixed(1) },
    { label: `${t.power} [kW]`, key: 'p', fmt: r => (r.estimated_power / 1000).toFixed(1) },
    { label: 'NPSHr [m]', key: 'npsh', fmt: r => r.estimated_npsh_r.toFixed(1) },
  ]

  const best = (key: string): number => {
    const vals = designs.filter(d => d.result).map((d, i) => {
      const r = d.result!
      if (key === 'eta') return { i, v: r.estimated_efficiency }
      if (key === 'p') return { i, v: -r.estimated_power }
      if (key === 'npsh') return { i, v: -r.estimated_npsh_r }
      return { i, v: 0 }
    })
    return vals.length ? vals.sort((a, b) => b.v - a.v)[0].i : -1
  }

  const inputSt: React.CSSProperties = { padding: 4, border: '1px solid var(--border-primary)', borderRadius: 3, fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-primary)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: 0 }}>{t.designComparison}</h3>
        <button onClick={addDesign} disabled={designs.length >= 4} style={{ ...inputSt, cursor: 'pointer', padding: '4px 12px' }}>{t.add}</button>
        <button onClick={runAll} disabled={loading} className="btn-primary" style={{ padding: '4px 16px', fontSize: 12 }}>
          {loading ? t.computing : t.runAll}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${designs.length}, 1fr)`, gap: 8, marginBottom: 12, fontSize: 12 }}>
        <div />
        {designs.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input value={d.label} onChange={e => update(i, 'label', e.target.value)} style={{ ...inputSt, fontWeight: 600 }} />
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="number" value={d.flowRate} onChange={e => update(i, 'flowRate', e.target.value)} style={{ ...inputSt, width: '33%' }} title="Q [m³/h]" />
              <input type="number" value={d.head} onChange={e => update(i, 'head', e.target.value)} style={{ ...inputSt, width: '33%' }} title="H [m]" />
              <input type="number" value={d.rpm} onChange={e => update(i, 'rpm', e.target.value)} style={{ ...inputSt, width: '33%' }} title="RPM" />
            </div>
          </div>
        ))}
      </div>

      {hasResults && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '6px 12px 6px 0', color: 'var(--text-muted)', width: 140 }}>{row.label}</td>
                {designs.map((d, i) => (
                  <td key={i} style={{ padding: 6, fontWeight: best(row.key) === i ? 700 : 400, color: best(row.key) === i ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {d.result ? row.fmt(d.result) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
