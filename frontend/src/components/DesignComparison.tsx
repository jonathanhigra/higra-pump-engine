import React, { useState } from 'react'
import { runSizing } from '../services/api'
import type { SizingResult } from '../App'

interface DesignEntry {
  label: string
  flowRate: number
  head: number
  rpm: number
  result: SizingResult | null
}

export default function DesignComparison() {
  const [designs, setDesigns] = useState<DesignEntry[]>([
    { label: 'Design A', flowRate: 180, head: 30, rpm: 1750, result: null },
    { label: 'Design B', flowRate: 180, head: 30, rpm: 2900, result: null },
  ])
  const [loading, setLoading] = useState(false)

  const runAll = async () => {
    setLoading(true)
    const updated = await Promise.all(
      designs.map(async (d) => {
        try {
          const result = await runSizing(d.flowRate / 3600, d.head, d.rpm)
          return { ...d, result }
        } catch {
          return { ...d, result: null }
        }
      }),
    )
    setDesigns(updated)
    setLoading(false)
  }

  const updateDesign = (idx: number, field: string, value: string) => {
    const copy = [...designs]
    ;(copy[idx] as any)[field] = field === 'label' ? value : parseFloat(value) || 0
    copy[idx].result = null
    setDesigns(copy)
  }

  const addDesign = () => {
    if (designs.length >= 4) return
    setDesigns([...designs, {
      label: `Design ${String.fromCharCode(65 + designs.length)}`,
      flowRate: 180, head: 30, rpm: 1750, result: null,
    }])
  }

  const hasResults = designs.some(d => d.result)

  const rows: { label: string; key: string; fmt: (r: SizingResult) => string }[] = [
    { label: 'Nq', key: 'nq', fmt: r => r.specific_speed_nq.toFixed(1) },
    { label: 'D2 [mm]', key: 'd2', fmt: r => (r.impeller_d2 * 1000).toFixed(1) },
    { label: 'D1 [mm]', key: 'd1', fmt: r => (r.impeller_d1 * 1000).toFixed(1) },
    { label: 'b2 [mm]', key: 'b2', fmt: r => (r.impeller_b2 * 1000).toFixed(1) },
    { label: 'Blades', key: 'z', fmt: r => `${r.blade_count}` },
    { label: 'beta1 [deg]', key: 'b1', fmt: r => r.beta1.toFixed(1) },
    { label: 'beta2 [deg]', key: 'b2a', fmt: r => r.beta2.toFixed(1) },
    { label: 'Efficiency [%]', key: 'eta', fmt: r => (r.estimated_efficiency * 100).toFixed(1) },
    { label: 'Power [kW]', key: 'p', fmt: r => (r.estimated_power / 1000).toFixed(1) },
    { label: 'NPSHr [m]', key: 'npsh', fmt: r => r.estimated_npsh_r.toFixed(1) },
  ]

  const best = (key: string): number => {
    const vals = designs.filter(d => d.result).map((d, i) => {
      const r = d.result!
      if (key === 'eta') return { i, v: r.estimated_efficiency }
      if (key === 'p') return { i, v: -r.estimated_power } // Lower is better
      if (key === 'npsh') return { i, v: -r.estimated_npsh_r }
      return { i, v: 0 }
    })
    if (!vals.length) return -1
    return vals.sort((a, b) => b.v - a.v)[0].i
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h3 style={{ color: '#2E8B57', fontSize: 15, margin: 0 }}>Design Comparison</h3>
        <button onClick={addDesign} disabled={designs.length >= 4} style={{
          padding: '4px 12px', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
        }}>+ Add</button>
        <button onClick={runAll} disabled={loading} style={{
          padding: '4px 16px', background: loading ? '#999' : '#2E8B57', color: '#fff',
          border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>{loading ? 'Computing...' : 'Run All'}</button>
      </div>

      {/* Input row */}
      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${designs.length}, 1fr)`, gap: 8, marginBottom: 12, fontSize: 12 }}>
        <div />
        {designs.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input value={d.label} onChange={e => updateDesign(i, 'label', e.target.value)}
              style={{ fontWeight: 600, border: '1px solid #ddd', borderRadius: 3, padding: '3px 6px', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="number" value={d.flowRate} onChange={e => updateDesign(i, 'flowRate', e.target.value)}
                style={{ width: '33%', padding: 3, border: '1px solid #ddd', borderRadius: 3, fontSize: 11 }} title="Q [m3/h]" />
              <input type="number" value={d.head} onChange={e => updateDesign(i, 'head', e.target.value)}
                style={{ width: '33%', padding: 3, border: '1px solid #ddd', borderRadius: 3, fontSize: 11 }} title="H [m]" />
              <input type="number" value={d.rpm} onChange={e => updateDesign(i, 'rpm', e.target.value)}
                style={{ width: '33%', padding: 3, border: '1px solid #ddd', borderRadius: 3, fontSize: 11 }} title="RPM" />
            </div>
          </div>
        ))}
      </div>

      {/* Results table */}
      {hasResults && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '6px 12px 6px 0', color: '#888', width: 140 }}>{row.label}</td>
                {designs.map((d, i) => {
                  const isBest = best(row.key) === i
                  return (
                    <td key={i} style={{
                      padding: 6, fontWeight: isBest ? 700 : 400,
                      color: isBest ? '#2E8B57' : '#333',
                    }}>
                      {d.result ? row.fmt(d.result) : '-'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
