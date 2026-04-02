import React, { useState, useEffect } from 'react'
import t from './i18n/pt-br'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import SizingForm from './pages/SizingForm'
import ResultsView from './pages/ResultsView'
import CurvesChart from './components/CurvesChart'
import VelocityTriangle from './components/VelocityTriangle'
import LossBreakdownChart from './components/LossBreakdownChart'
import StressView from './components/StressView'
import ImpellerViewer from './components/ImpellerViewer'
import DesignComparison from './components/DesignComparison'
import AssistantChat from './components/AssistantChat'
import MeridionalView from './components/MeridionalView'
import OptimizePanel from './components/OptimizePanel'
import EfficiencyMap from './components/EfficiencyMap'
import LoadingEditor from './components/LoadingEditor'
import PressureDistribution from './components/PressureDistribution'
import MultiSpeedChart from './components/MultiSpeedChart'
import MeridionalEditor from './components/MeridionalEditor'
import SpanwiseLoadingChart from './components/SpanwiseLoadingChart'
import ReferencePanel from './components/ReferencePanel'
import ExportPanel from './components/ExportPanel'
import { runSizing, getCurves, getLossBreakdown, runStressAnalysis } from './services/api'

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
  uncertainty?: Record<string, number>
}

export interface CurvePoint {
  flow_rate: number
  head: number
  efficiency: number
  power: number
  npsh_required: number
  is_unstable?: boolean
}

type Page = 'login' | 'projects' | 'design'
export type Tab = 'results' | 'curves' | '3d' | 'velocity' | 'losses' | 'stress' | 'compare' | 'assistant' | 'optimize' | 'loading' | 'pressure' | 'multispeed' | 'meridional-editor' | 'spanwise'

export default function App() {
  const [page, setPage] = useState<Page>('login')
  const [user, setUser] = useState<any>(null)
  const [token, setToken] = useState('')
  const [currentProject, setCurrentProject] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('results')

  const [sizing, setSizing] = useState<SizingResult | null>(null)
  const [curves, setCurves] = useState<CurvePoint[]>([])
  const [losses, setLosses] = useState<any>(null)
  const [stress, setStress] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [opPoint, setOpPoint] = useState({ flowRate: 180, head: 30, rpm: 1750 })

  useEffect(() => {
    const saved = localStorage.getItem('hpe_token')
    if (saved) { setToken(saved); setPage('projects') }
  }, [])

  const handleLogin = (userData: any, tok: string) => {
    setUser(userData); setToken(tok); setPage('projects')
  }

  const handleLogout = () => {
    localStorage.removeItem('hpe_token')
    setUser(null); setToken(''); setPage('login'); setSizing(null)
  }

  const handleNavigate = (p: 'projects' | 'design', t?: Tab) => {
    if (p === 'projects') {
      setPage('projects')
      setSizing(null); setCurves([]); setLosses(null); setStress(null)
    } else {
      setPage('design')
      if (t) setTab(t)
    }
  }

  const handleSelectProject = (project: any) => {
    setCurrentProject(project)
    setSizing(null); setCurves([]); setLosses(null); setStress(null)
    setTab('results')
    setPage('design')
  }

  // Full sizing run — used by both SizingForm and 3D viewer floating form
  const handleRunSizing = async (q: number, h: number, n: number) => {
    setLoading(true)
    try {
      const qm3s = q / 3600
      const [result, curvesData, lossData, stressData] = await Promise.all([
        runSizing(qm3s, h, n),
        getCurves(qm3s, h, n).catch(() => ({ points: [] })),
        getLossBreakdown(qm3s, h, n).catch(() => null),
        runStressAnalysis(qm3s, h, n).catch(() => null),
      ])
      setSizing(result)
      setCurves(curvesData.points || [])
      setLosses(lossData)
      setStress(stressData)
      setOpPoint({ flowRate: q, head: h, rpm: n })
    } finally {
      setLoading(false)
    }
  }

  // === LOGIN ===
  if (page === 'login') {
    return <LoginPage onLogin={handleLogin} />
  }

  // === PROJECTS ===
  if (page === 'projects') {
    return (
      <Layout page="projects" activeTab={null} userName={user?.name || t.user}
        onNavigate={handleNavigate} onLogout={handleLogout}>
        <ProjectsPage onSelectProject={handleSelectProject} token={token} />
      </Layout>
    )
  }

  // === DESIGN — 3D fullscreen ===
  if (tab === '3d') {
    return (
      <Layout page="design" activeTab={tab} userName={user?.name || t.user}
        onNavigate={handleNavigate} onLogout={handleLogout} noPad>
        <ImpellerViewer
          flowRate={opPoint.flowRate}
          head={opPoint.head}
          rpm={opPoint.rpm}
          fullscreen
          loading={loading}
          sizing={sizing}
          onRunSizing={handleRunSizing}
        />
      </Layout>
    )
  }

  // === DESIGN — other tabs ===
  return (
    <Layout page="design" activeTab={tab} userName={user?.name || t.user}
      onNavigate={handleNavigate} onLogout={handleLogout}>

      <div className="content-header">
        <h1>{currentProject?.name || t.quickDesign}</h1>
        {sizing && (
          <div className="meta">
            <span>Nq: <b>{sizing.specific_speed_nq.toFixed(1)}</b></span>
            <span>D2: <b>{(sizing.impeller_d2 * 1000).toFixed(0)} mm</b></span>
            <span>eta: <b>{(sizing.estimated_efficiency * 100).toFixed(1)}%</b></span>
          </div>
        )}
      </div>

      {/* Two-column design layout: left = form + export, right = results + analysis tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>

        {/* LEFT PANEL — always visible */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SizingForm
            onResult={(result, curvePoints, lossData, stressData, op) => {
              setSizing(result); setCurves(curvePoints)
              setLosses(lossData); setStress(stressData)
              if (op) setOpPoint(op)
            }}
            loading={loading}
            setLoading={setLoading}
          />
          <ExportPanel sizing={sizing} op={sizing ? opPoint : null} />
        </div>

        {/* RIGHT PANEL — results area */}
        <div>
          {sizing ? (
            <>
              {/* Results + reference comparison always visible in results tab */}
              {tab === 'results' && (
                <>
                  <ResultsView sizing={sizing} />
                  <ReferencePanel sizing={sizing} />
                </>
              )}
              {tab === 'curves' && (
                <>
                  <CurvesChart points={curves} designFlow={opPoint.flowRate / 3600} designHead={opPoint.head} />
                  <div style={{ marginTop: 24 }}>
                    <EfficiencyMap flowRate={opPoint.flowRate} head={opPoint.head} rpm={opPoint.rpm} />
                  </div>
                </>
              )}
              {tab === 'velocity' && <VelocityTriangle triangles={sizing.velocity_triangles} />}
              {tab === 'losses' && <LossBreakdownChart losses={losses} />}
              {tab === 'stress' && <StressView stress={stress} />}
              {tab === 'compare' && <DesignComparison />}
              {tab === 'optimize' && <OptimizePanel defaultFlowRate={opPoint.flowRate} defaultHead={opPoint.head} defaultRpm={opPoint.rpm} />}
              {tab === 'assistant' && <AssistantChat sizing={sizing} />}
              {tab === 'loading' && <LoadingEditor />}
              {tab === 'pressure' && <PressureDistribution sizing={sizing} />}
              {tab === 'multispeed' && <MultiSpeedChart flowRate={opPoint.flowRate} head={opPoint.head} rpm={opPoint.rpm} />}
              {tab === 'meridional-editor' && (
                <MeridionalEditor
                  d1={sizing.impeller_d1}
                  d2={sizing.impeller_d2}
                  b2={sizing.impeller_b2}
                />
              )}
              {tab === 'spanwise' && <SpanwiseLoadingChart sizing={sizing} />}
            </>
          ) : (
            /* Empty state — shown before first sizing run */
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 420, gap: 12,
              color: 'var(--text-muted)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 48, lineHeight: 1 }}>&#9889;</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Pronto para projetar
              </div>
              <div style={{ fontSize: 13, maxWidth: 300, lineHeight: 1.6 }}>
                Preencha os dados à esquerda e clique em{' '}
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                  "Executar Dimensionamento"
                </span>{' '}
                para começar.
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
