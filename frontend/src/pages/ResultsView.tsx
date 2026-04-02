import React from 'react'

interface Props {
  sizing: {
    specific_speed_nq: number
    impeller_type: string
    impeller_d2: number
    impeller_d1: number
    impeller_b2: number
    blade_count: number
    beta1: number
    beta2: number
    estimated_efficiency: number
    estimated_power: number
    estimated_npsh_r: number
    warnings: string[]
  }
}

export default function ResultsView({ sizing }: Props) {
  const s = sizing
  const row = (label: string, value: string) => (
    <tr key={label}>
      <td style={{ padding: '4px 12px 4px 0', color: '#555', fontSize: 13 }}>{label}</td>
      <td style={{ padding: '4px 0', fontWeight: 500 }}>{value}</td>
    </tr>
  )

  return (
    <div style={{ marginBottom: 30 }}>
      <h3 style={{ color: '#2E8B57' }}>Sizing Results</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#888' }}>Specific Speed</h4>
          <table><tbody>
            {row('Nq', s.specific_speed_nq.toFixed(1))}
            {row('Type', s.impeller_type)}
          </tbody></table>
        </div>

        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#888' }}>Impeller</h4>
          <table><tbody>
            {row('D2', `${(s.impeller_d2 * 1000).toFixed(1)} mm`)}
            {row('D1', `${(s.impeller_d1 * 1000).toFixed(1)} mm`)}
            {row('b2', `${(s.impeller_b2 * 1000).toFixed(1)} mm`)}
            {row('Blades', `${s.blade_count}`)}
            {row('beta1', `${s.beta1.toFixed(1)} deg`)}
            {row('beta2', `${s.beta2.toFixed(1)} deg`)}
          </tbody></table>
        </div>

        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#888' }}>Performance</h4>
          <table><tbody>
            {row('Efficiency', `${(s.estimated_efficiency * 100).toFixed(1)}%`)}
            {row('Power', `${(s.estimated_power / 1000).toFixed(1)} kW`)}
            {row('NPSHr', `${s.estimated_npsh_r.toFixed(1)} m`)}
          </tbody></table>
        </div>
      </div>

      {s.warnings.length > 0 && (
        <div style={{ marginTop: 15, padding: 10, background: '#fff3cd', borderRadius: 4 }}>
          <strong style={{ fontSize: 13 }}>Warnings:</strong>
          {s.warnings.map((w, i) => <p key={i} style={{ margin: '5px 0 0', fontSize: 13 }}>{w}</p>)}
        </div>
      )}
    </div>
  )
}
