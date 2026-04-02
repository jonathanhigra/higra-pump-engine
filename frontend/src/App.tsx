import React, { useState } from 'react'
import SizingForm from './pages/SizingForm'
import ResultsView from './pages/ResultsView'
import CurvesChart from './components/CurvesChart'

interface SizingResult {
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
  sigma: number
  velocity_triangles: Record<string, any>
  meridional_profile: Record<string, any>
  warnings: string[]
}

interface CurvePoint {
  flow_rate: number
  head: number
  efficiency: number
  power: number
  npsh_required: number
}

export default function App() {
  const [sizing, setSizing] = useState<SizingResult | null>(null)
  const [curves, setCurves] = useState<CurvePoint[]>([])
  const [loading, setLoading] = useState(false)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <header style={{ borderBottom: '2px solid #2E8B57', paddingBottom: 10, marginBottom: 30 }}>
        <h1 style={{ color: '#2E8B57', margin: 0 }}>Higra Pump Engine</h1>
        <p style={{ color: '#666', margin: '5px 0 0' }}>
          Hydraulic turbomachinery design platform
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 30 }}>
        <SizingForm
          onResult={(result, curvePoints) => {
            setSizing(result)
            setCurves(curvePoints)
          }}
          loading={loading}
          setLoading={setLoading}
        />
        <div>
          {sizing && <ResultsView sizing={sizing} />}
          {curves.length > 0 && <CurvesChart points={curves} />}
        </div>
      </div>
    </div>
  )
}
