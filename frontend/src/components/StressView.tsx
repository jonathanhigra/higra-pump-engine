import React from 'react'

interface Props {
  stress: any
}

export default function StressView({ stress }: Props) {
  if (!stress) return <p style={{ color: '#999' }}>Stress data unavailable. Check if the /stress endpoint is running.</p>

  const sfColor = (sf: number) => sf >= 2.0 ? '#4CAF50' : sf >= 1.5 ? '#FF9800' : '#F44336'

  const row = (label: string, value: string, unit: string = '') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span><b>{value}</b> {unit}</span>
    </div>
  )

  return (
    <div>
      <h3 style={{ color: '#2E8B57', fontSize: 15 }}>Structural Analysis</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, fontSize: 13 }}>
        <div style={{ background: '#f8f9fa', padding: 14, borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#888' }}>Centrifugal Stress</h4>
          {row('Root', (stress.centrifugal_stress_root / 1e6).toFixed(1), 'MPa')}
          {row('Tip', (stress.centrifugal_stress_tip / 1e6).toFixed(1), 'MPa')}
        </div>

        <div style={{ background: '#f8f9fa', padding: 14, borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#888' }}>Bending Stress</h4>
          {row('Leading Edge', (stress.bending_stress_le / 1e6).toFixed(1), 'MPa')}
          {row('Trailing Edge', (stress.bending_stress_te / 1e6).toFixed(1), 'MPa')}
          {row('Maximum', (stress.bending_stress_max / 1e6).toFixed(1), 'MPa')}
        </div>

        <div style={{ background: '#f8f9fa', padding: 14, borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#888' }}>Combined</h4>
          {row('Von Mises Max', (stress.von_mises_max / 1e6).toFixed(1), 'MPa')}
        </div>

        <div style={{ background: '#f8f9fa', padding: 14, borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#888' }}>Safety Factors</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: '#666' }}>Yield</span>
            <span style={{ color: sfColor(stress.sf_yield), fontWeight: 700 }}>{stress.sf_yield.toFixed(1)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: '#666' }}>Fatigue</span>
            <span style={{ color: sfColor(stress.sf_fatigue), fontWeight: 700 }}>{stress.sf_fatigue.toFixed(1)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: '#666' }}>Ultimate</span>
            <span style={{ color: sfColor(stress.sf_ultimate), fontWeight: 700 }}>{stress.sf_ultimate.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, fontSize: 13 }}>
        <div style={{ background: '#f0f7ff', padding: 14, borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#888' }}>Vibration</h4>
          {row('1st Natural Freq', stress.first_natural_freq.toFixed(0), 'Hz')}
          {row('Campbell Margin', (stress.campbell_margin * 100).toFixed(0), '%')}
        </div>

        <div style={{
          padding: 14, borderRadius: 6,
          background: stress.is_safe ? '#e8f5e9' : '#fde8e8',
          border: `1px solid ${stress.is_safe ? '#4CAF50' : '#F44336'}`,
        }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: stress.is_safe ? '#2E7D32' : '#C62828' }}>
            {stress.is_safe ? 'SAFE' : 'WARNING'}
          </h4>
          {stress.warnings?.length > 0 ? (
            stress.warnings.map((w: string, i: number) => (
              <p key={i} style={{ margin: '4px 0 0', fontSize: 12, color: '#555' }}>{w}</p>
            ))
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: '#555' }}>All safety factors within limits.</p>
          )}
        </div>
      </div>
    </div>
  )
}
