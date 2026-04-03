import React, { useState, useEffect, useCallback } from 'react'
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
import DoEPanel from './components/DoEPanel'
import ParetoPanel from './components/ParetoPanel'
import LeanSweepPanel from './components/LeanSweepPanel'
import LETEEditor from './components/LETEEditor'
import MeridionalDragEditor from './components/MeridionalDragEditor'
import TemplateSelector from './components/TemplateSelector'
import StatusBar from './components/StatusBar'
import DesignDashboard from './components/DesignDashboard'
import CommandPalette from './components/CommandPalette'
import Toast from './components/Toast'
import { useToast } from './hooks/useToast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { runSizing, getCurves, getLossBreakdown, runStressAnalysis } from './services/api'

/* Simple inline panels for Noise and Batch until full components are built */
function NoisePanel({ flowRate, head, rpm, sizing }: any) {
  const [result, setResult] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(false)
  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/v1/analysis/noise', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ flow_rate: flowRate, head, rpm }) })
      if (r.ok) setResult(await r.json())
    } finally { setLoading(false) }
  }
  return (
    <div>
      <button className="btn-primary" onClick={run} disabled={loading} style={{ fontSize: 13, padding: '8px 16px' }}>
        {loading ? 'Calculando...' : 'Calcular Ruído'}
      </button>
      {result && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
          <div>Lw total: <b style={{ color: 'var(--accent)' }}>{result.Lw_total_dB?.toFixed(1) ?? '—'} dB</b></div>
          <div>Lw(A): <b style={{ color: 'var(--accent)' }}>{result.Lw_A_weighted_dB?.toFixed(1) ?? '—'} dBA</b></div>
          <div>BPF: <b>{result.bpf_hz?.toFixed(0) ?? '—'} Hz</b></div>
          <div>Fonte dominante: <b>{result.dominant_source ?? '—'}</b></div>
        </div>
      )}
    </div>
  )
}

function BatchPanel({ baseFlowRate, baseHead, baseRpm }: any) {
  const [results, setResults] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [variable, setVariable] = React.useState('rpm')
  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/v1/batch/parametric', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ flow_rate: baseFlowRate, head: baseHead, rpm: baseRpm, sweep_variable: variable, n_points: 10 }) })
      if (r.ok) { const d = await r.json(); setResults(d.results || d) }
    } finally { setLoading(false) }
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <select value={variable} onChange={e => setVariable(e.target.value)} className="input" style={{ width: 160 }}>
          <option value="rpm">RPM</option><option value="flow_rate">Vazão</option><option value="head">Altura</option>
        </select>
        <button className="btn-primary" onClick={run} disabled={loading} style={{ fontSize: 13, padding: '8px 16px' }}>
          {loading ? 'Executando...' : 'Sweep Paramétrico'}
        </button>
      </div>
      {results.length > 0 && (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-muted)' }}>Nq</th>
            <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-muted)' }}>D2 [mm]</th>
            <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-muted)' }}>η [%]</th>
            <th style={{ padding: 6, textAlign: 'left', color: 'var(--text-muted)' }}>Power [kW]</th>
          </tr></thead>
          <tbody>{results.map((r: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: 6 }}>{(r.specific_speed_nq ?? r.nq)?.toFixed(1)}</td>
              <td style={{ padding: 6 }}>{((r.impeller_d2 ?? r.d2) * 1000)?.toFixed(0)}</td>
              <td style={{ padding: 6 }}>{((r.estimated_efficiency ?? r.eta) * 100)?.toFixed(1)}</td>
              <td style={{ padding: 6 }}>{((r.estimated_power ?? r.power) / 1000)?.toFixed(1)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}

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
export type Tab =
  | 'results' | 'curves' | '3d' | 'velocity' | 'losses' | 'stress'
  | 'compare' | 'assistant' | 'optimize' | 'loading' | 'pressure'
  | 'multispeed' | 'meridional-editor' | 'spanwise'
  | 'templates' | 'doe' | 'pareto' | 'lean-sweep' | 'lete'
  | 'meridional-drag' | 'noise' | 'batch'

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
  const [advancedMode, setAdvancedMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const { toasts, toast, dismiss } = useToast()

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

  const handleSaveDesign = async () => {
    if (!sizing || !currentProject) return
    setSaving(true)
    try {
      const body = {
        sizing_result: sizing as any,
        operating_point: { flow_rate: opPoint.flowRate / 3600, head: opPoint.head, rpm: opPoint.rpm },
        curve_points: curves.map(c => ({
          flow_rate: c.flow_rate, head: c.head, efficiency: c.efficiency,
          power: c.power, npsh_required: c.npsh_required, is_unstable: c.is_unstable ?? false,
        })),
      }
      const r = await fetch(`/api/v1/projects/${currentProject.id}/designs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (r.ok) { const d = await r.json(); setSavedId(d.id); toast('Design salvo no projeto', 'success') }
      else { toast('Erro ao salvar design', 'error') }
    } catch { toast('Erro ao salvar design', 'error') }
    finally { setSaving(false) }
  }

  // Full sizing run — sequential to avoid BaseHTTPMiddleware concurrency deadlock
  const handleRunSizing = async (q: number, h: number, n: number) => {
    setLoading(true)
    try {
      const qm3s = q / 3600
      // 1. Main sizing first
      const result = await runSizing(qm3s, h, n)
      setSizing(result)
      setOpPoint({ flowRate: q, head: h, rpm: n })
      setSavedId(null)

      // 2. Secondary data — sequential to avoid middleware serialization deadlock
      const curvesData = await getCurves(qm3s, h, n).catch(() => ({ points: [] }))
      setCurves(curvesData.points || [])

      const lossData = await getLossBreakdown(qm3s, h, n).catch(() => null)
      setLosses(lossData)

      const stressData = await runStressAnalysis(qm3s, h, n).catch(() => null)
      setStress(stressData)

      toast('Dimensionamento concluido', 'success')
    } catch {
      toast('Erro ao calcular', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Keyboard shortcuts
  const handleRunSizingShortcut = useCallback(() => {
    if (sizing || opPoint) handleRunSizing(opPoint.flowRate, opPoint.head, opPoint.rpm)
  }, [opPoint, sizing])

  useKeyboardShortcuts({
    onRunSizing: handleRunSizingShortcut,
    onSave: handleSaveDesign,
    onCmdPalette: () => setCmdOpen(true),
    onNavigate: handleNavigate,
    onEscape: () => { setCmdOpen(false); setShortcutsHelpOpen(false) },
  })

  /* Shared overlay elements rendered in all authenticated pages */
  const overlays = (
    <>
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={handleNavigate}
        onRunSizing={handleRunSizingShortcut}
      />
      <Toast messages={toasts} onDismiss={dismiss} />
      {shortcutsHelpOpen && <ShortcutsHelpModal onClose={() => setShortcutsHelpOpen(false)} />}
    </>
  )

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
        <StatusBar sizing={sizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} />
        {overlays}
      </Layout>
    )
  }

  // Tabs that need full width (no 2-column layout with SizingForm)
  const WIDE_TABS: Tab[] = ['3d', 'meridional-drag', 'meridional-editor', 'lete', 'lean-sweep', 'doe', 'pareto', 'batch', 'templates', 'compare', 'optimize']

  // === DESIGN — fullscreen tabs (3D viewer) ===
  if (tab === '3d') {
    return (
      <Layout page="design" activeTab={tab} userName={user?.name || t.user}
        projectName={currentProject?.name} onNavigate={handleNavigate} onLogout={handleLogout} noPad>
        <ImpellerViewer
          flowRate={opPoint.flowRate}
          head={opPoint.head}
          rpm={opPoint.rpm}
          fullscreen
          loading={loading}
          sizing={sizing}
          onRunSizing={handleRunSizing}
        />
        <StatusBar sizing={sizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} />
        {overlays}
      </Layout>
    )
  }

  // === DESIGN — wide tabs (editors, optimization, etc.) ===
  if (WIDE_TABS.includes(tab) && tab !== '3d') {
    return (
      <Layout page="design" activeTab={tab} userName={user?.name || t.user}
        projectName={currentProject?.name} onNavigate={handleNavigate} onLogout={handleLogout}>
        <div style={{ maxWidth: 1100 }}>
          {tab === 'templates' && (
            <TemplateSelector onSelect={(tmpl: any) => {
              if (tmpl.flow_rate && tmpl.head && tmpl.rpm) handleRunSizing(tmpl.flow_rate, tmpl.head, tmpl.rpm)
            }} />
          )}
          {tab === 'meridional-drag' && sizing && (
            <MeridionalDragEditor d1={sizing.impeller_d1 * 1000} d2={sizing.impeller_d2 * 1000} b2={sizing.impeller_b2 * 1000} />
          )}
          {tab === 'meridional-editor' && sizing && (
            <MeridionalEditor d1={sizing.impeller_d1} d2={sizing.impeller_d2} b2={sizing.impeller_b2} />
          )}
          {tab === 'lete' && sizing && (
            <LETEEditor nq={sizing.specific_speed_nq} flowRate={opPoint.flowRate / 3600} head={opPoint.head} rpm={opPoint.rpm} />
          )}
          {tab === 'lean-sweep' && (
            <LeanSweepPanel defaultFlowRate={opPoint.flowRate / 3600} defaultHead={opPoint.head} defaultRpm={opPoint.rpm} />
          )}
          {tab === 'doe' && <DoEPanel />}
          {tab === 'pareto' && (
            <ParetoPanel defaultFlowRate={opPoint.flowRate} defaultHead={opPoint.head} defaultRpm={opPoint.rpm} />
          )}
          {tab === 'batch' && (
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: 15 }}>Batch / Paramétrico</h3>
              <BatchPanel baseFlowRate={opPoint.flowRate / 3600} baseHead={opPoint.head} baseRpm={opPoint.rpm} />
            </div>
          )}
          {tab === 'compare' && <DesignComparison />}
          {tab === 'optimize' && <OptimizePanel defaultFlowRate={opPoint.flowRate} defaultHead={opPoint.head} defaultRpm={opPoint.rpm} />}
          {!sizing && tab !== 'templates' && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Execute um dimensionamento primeiro para usar esta funcionalidade.
            </div>
          )}
        </div>
        <StatusBar sizing={sizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} />
        {overlays}
      </Layout>
    )
  }

  // === DESIGN — standard 2-column layout (sizing form + results) ===
  return (
    <Layout page="design" activeTab={tab} userName={user?.name || t.user}
      projectName={currentProject?.name} onNavigate={handleNavigate} onLogout={handleLogout}>

      <div className="content-header">
        <h1>{currentProject?.name || t.quickDesign}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {sizing && (
            <div className="meta">
              <span>Nq: <b>{sizing.specific_speed_nq.toFixed(1)}</b></span>
              <span>D2: <b>{(sizing.impeller_d2 * 1000).toFixed(0)} mm</b></span>
              <span>eta: <b>{(sizing.estimated_efficiency * 100).toFixed(1)}%</b></span>
            </div>
          )}
          {sizing && currentProject && (
            <button
              type="button"
              onClick={handleSaveDesign}
              disabled={saving || !!savedId}
              style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: saving || savedId ? 'default' : 'pointer',
                border: `1px solid ${savedId ? 'var(--accent-success)' : 'var(--border-primary)'}`,
                background: savedId ? 'rgba(76,175,80,0.12)' : 'transparent',
                color: savedId ? 'var(--accent-success)' : 'var(--text-muted)',
                fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {saving ? t.saving : savedId ? `✓ ${t.designSaved}` : t.saveDesign}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdvancedMode(v => !v)}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${advancedMode ? 'var(--accent)' : 'var(--border-primary)'}`,
              background: advancedMode ? 'rgba(0,160,223,0.15)' : 'transparent',
              color: advancedMode ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {advancedMode ? '● Modo Avançado' : '○ Modo Avançado'}
          </button>
        </div>
      </div>
      {advancedMode && (
        <div style={{
          marginBottom: 12, padding: '8px 14px',
          background: 'rgba(0,160,223,0.06)',
          border: '1px solid rgba(0,160,223,0.2)',
          borderRadius: 6, fontSize: 12,
          color: 'var(--text-secondary)',
        }}>
          <b style={{ color: 'var(--accent)' }}>Modo Avançado:</b> acesse mais análises na barra lateral esquerda — Triângulos, Perdas, Tensões, Otimização, Carregamento, Pressão, Multi-velocidade e Trecho Meridional.
        </div>
      )}

      {/* Two-column design layout: left = form + export, right = results + analysis tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>

        {/* LEFT PANEL — always visible */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SizingForm
            onResult={(result, curvePoints, lossData, stressData, op) => {
              setSizing(result); setCurves(curvePoints)
              setLosses(lossData); setStress(stressData)
              if (op) setOpPoint(op)
              setSavedId(null)
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
              {/* compare and optimize are now in wide-tab layout */}
              {tab === 'assistant' && <AssistantChat sizing={sizing} />}
              {tab === 'loading' && <LoadingEditor />}
              {tab === 'pressure' && <PressureDistribution sizing={sizing} />}
              {tab === 'multispeed' && <MultiSpeedChart flowRate={opPoint.flowRate} head={opPoint.head} rpm={opPoint.rpm} />}
              {/* meridional-editor is now in wide-tab layout */}
              {tab === 'spanwise' && <SpanwiseLoadingChart sizing={sizing} />}
              {/* doe, pareto, lean-sweep, lete, meridional-drag, batch are now in wide-tab layout */}
              {tab === 'noise' && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: 15 }}>Predição de Ruído</h3>
                  <NoisePanel flowRate={opPoint.flowRate / 3600} head={opPoint.head} rpm={opPoint.rpm} sizing={sizing} />
                </div>
              )}
            </>
          ) : (
            /* Dashboard / empty state — shown before first sizing run or on results tab */
            <DesignDashboard
              sizing={null}
              opPoint={opPoint}
              onNavigate={(t) => handleNavigate('design', t)}
              onRunSizing={handleRunSizing}
            />
          )}
        </div>
      </div>
      <StatusBar sizing={sizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} />
      {overlays}
    </Layout>
  )
}

/* ── Shortcuts Help Modal ─────────────────────────────────────────────────── */
function ShortcutsHelpModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: 'Ctrl+K', desc: 'Abrir command palette' },
    { keys: 'Ctrl+S', desc: 'Salvar design' },
    { keys: 'F5 / Ctrl+Enter', desc: 'Executar dimensionamento' },
    { keys: '1-7', desc: 'Navegar entre secoes' },
    { keys: 'Esc', desc: 'Fechar modal/palette' },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 360, background: 'var(--bg-elevated)',
          borderRadius: 12, border: '1px solid var(--border-primary)',
          boxShadow: 'var(--shadow-md)', padding: 24,
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>Atalhos de Teclado</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shortcuts.map(s => (
            <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.desc}</span>
              <kbd style={{
                fontSize: 11, padding: '2px 8px',
                background: 'var(--bg-surface)', borderRadius: 4,
                border: '1px solid var(--border-primary)',
                color: 'var(--text-muted)', fontFamily: 'var(--font-family)',
              }}>{s.keys}</kbd>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '8px 0',
            background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
            borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: 13, fontFamily: 'var(--font-family)',
          }}
        >
          Fechar (Esc)
        </button>
      </div>
    </div>
  )
}
