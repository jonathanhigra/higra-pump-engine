import React, { useState } from 'react'
import SizingForm from './pages/SizingForm'
import ResultsView from './pages/ResultsView'
import CurvesChart from './components/CurvesChart'
import VelocityTriangle from './components/VelocityTriangle'
import LossBreakdownChart from './components/LossBreakdownChart'
import StressView from './components/StressView'

export interface SizingResult {
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

export interface CurvePoint {
  flow_rate: number
  head: number
  efficiency: number
  power: number
  npsh_required: number
}

type Tab = 'results' | 'curves' | 'velocity' | 'losses' | 'stress'

export default function App() {
  const [sizing, setSizing] = useState<SizingResult | null>(null)
  const [curves, setCurves] = useState<CurvePoint[]>([])
  const [losses, setLosses] = useState<any>(null)
  const [stress, setStress] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('results')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'results', label: 'Sizing' },
    { key: 'curves', label: 'Curves' },
    { key: 'velocity', label: 'Velocity' },
    { key: 'losses', label: 'Losses' },
    { key: 'stress', label: 'Stress' },
  ]

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 1280, margin: '0 auto', padding: '16px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '2px solid #2E8B57', paddingBottom: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ color: '#2E8B57', margin: 0, fontSize: 24, letterSpacing: -0.5 }}>Higra Pump Engine</h1>
          <p style={{ color: '#888', margin: '2px 0 0', fontSize: 13 }}>
            Hydraulic turbomachinery design platform
          </p>
        </div>
        {sizing && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13, color: '#666' }}>
            <span>Nq: <b>{sizing.specific_speed_nq.toFixed(1)}</b></span>
            <span>D2: <b>{(sizing.impeller_d2 * 1000).toFixed(0)} mm</b></span>
            <span>eta: <b>{(sizing.estimated_efficiency * 100).toFixed(1)}%</b></span>
          </div>
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        <div>
          <SizingForm
            onResult={(result, curvePoints, lossData, stressData) => {
              setSizing(result)
              setCurves(curvePoints)
              setLosses(lossData)
              setStress(stressData)
            }}
            loading={loading}
            setLoading={setLoading}
          />
        </div>

        <div>
          {sizing && (
            <>
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ddd', marginBottom: 20 }}>
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      padding: '8px 20px', border: 'none', cursor: 'pointer',
                      background: tab === t.key ? '#2E8B57' : 'transparent',
                      color: tab === t.key ? '#fff' : '#666',
                      fontWeight: tab === t.key ? 600 : 400,
                      fontSize: 13, borderRadius: '4px 4px 0 0',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'results' && <ResultsView sizing={sizing} />}
              {tab === 'curves' && <CurvesChart points={curves} />}
              {tab === 'velocity' && <VelocityTriangle triangles={sizing.velocity_triangles} />}
              {tab === 'losses' && <LossBreakdownChart losses={losses} />}
              {tab === 'stress' && <StressView stress={stress} />}
            </>
          )}

          {!sizing && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: '#bbb', fontSize: 15 }}>
              Enter operating point and click "Run Sizing" to begin
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
