import React, { useState, useEffect, useCallback, useRef } from 'react'
import t from './i18n'
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
import OptimizationPresets from './components/OptimizationPresets'
import TemplateSelector from './components/TemplateSelector'
import StatusBar from './components/StatusBar'
import DesignDashboard from './components/DesignDashboard'
import ProgressStepper from './components/ProgressStepper'
import ResultsSkeleton from './components/ResultsSkeleton'
import CommandPalette from './components/CommandPalette'
import Toast from './components/Toast'
import HistoryPanel from './components/HistoryPanel'
import type { HistoryEntry } from './components/HistoryPanel'
import NextStepBanner from './components/NextStepBanner'
import VersionPanel from './components/VersionPanel'
import VersionCompareModal from './components/VersionCompareModal'
import GuidedTour from './components/GuidedTour'
import FloatingMetrics from './components/FloatingMetrics'
import DesignQualityBadge from './components/DesignQualityBadge'
import EvolutionSparkline from './components/EvolutionSparkline'
import ContextualHelp from './components/ContextualHelp'
import ExportCenter from './components/ExportCenter'
import WhatsNew from './components/WhatsNew'
import FeatureTip from './components/FeatureTip'
import ActionTimeline from './components/ActionTimeline'
import type { TimelineEntry } from './components/ActionTimeline'
import SectionGuide from './components/SectionGuide'
import Glossary from './components/Glossary'
import CompleteResultView from './components/CompleteResultView'
import GlobalContextMenu from './components/GlobalContextMenu'
import { incrementSizingCount } from './components/ProgressBadge'
import FeedbackStars from './components/FeedbackStars'
import QuickSummary from './components/QuickSummary'
import ProjectChecklist from './components/ProjectChecklist'
import { emailResults } from './utils/emailResults'
import useDynamicFavicon from './hooks/useDynamicFavicon'
import { useToast } from './hooks/useToast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { runSizing, getCurves, getLossBreakdown, runStressAnalysis, saveVersion, compareVersions, deleteVersion as apiDeleteVersion } from './services/api'
import type { VersionEntry, VersionCompareResult } from './services/api'

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
  | 'overview' | 'results' | 'curves' | '3d' | 'velocity' | 'losses' | 'stress'
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
  // const [advancedMode, setAdvancedMode] = useState(false) // removed from header — available in sidebar
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [previousSizing, setPreviousSizing] = useState<SizingResult | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const [tourActive, setTourActive] = useState(() => !localStorage.getItem('hpe_tour_completed'))
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null)
  const [compareData, setCompareData] = useState<VersionCompareResult | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [exportCenterOpen, setExportCenterOpen] = useState(false)
  const [tabHistory, setTabHistory] = useState<Tab[]>([])
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(() => localStorage.getItem('hpe_whats_new_seen') !== '0.2.0')
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [overviewTab, setOverviewTab] = useState(false)  // CompleteResultView toggle (#10)
  const [showAutoRestore, setShowAutoRestore] = useState(false)
  const { toasts, toast, dismiss } = useToast()

  // Dynamic favicon showing Nq value
  useDynamicFavicon(sizing?.specific_speed_nq || null)

  // Tab history tracking
  useEffect(() => {
    if (tab) setTabHistory(prev => {
      const next = [...prev, tab]
      return next.slice(-20)
    })
  }, [tab])

  const goBack = () => {
    if (tabHistory.length < 2) return
    const prev = tabHistory[tabHistory.length - 2]
    setTabHistory(h => h.slice(0, -1))
    setTab(prev)
  }

  // Action timeline logger
  const logAction = useCallback((action: string, detail?: string) => {
    setTimeline(prev => [...prev, { time: new Date(), action, detail }])
  }, [])

  // Helper to mark a progress step as completed
  const markStep = useCallback((step: string) => {
    setCompletedSteps(prev => prev.includes(step) ? prev : [...prev, step])
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('hpe_token')
    if (saved) { setToken(saved); setPage('projects') }
  }, [])

  // Auto-save to localStorage every 30s (feature #10)
  useEffect(() => {
    const timer = setInterval(() => {
      if (sizing) {
        localStorage.setItem('hpe_autosave', JSON.stringify({
          opPoint, tab, projectName: currentProject?.name, timestamp: Date.now(),
        }))
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [sizing, opPoint, tab, currentProject])

  // Check for auto-restore on mount (feature #10)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('hpe_autosave')
      if (raw) {
        const state = JSON.parse(raw)
        if (Date.now() - state.timestamp < 86400000) setShowAutoRestore(true)
      }
    } catch { /* ignore */ }
  }, [])

  // Track progress steps based on state changes
  useEffect(() => {
    if (opPoint.flowRate > 0 && opPoint.head > 0 && opPoint.rpm > 0) markStep('dados')
  }, [opPoint, markStep])

  useEffect(() => {
    if (sizing) markStep('sizing')
  }, [sizing, markStep])

  useEffect(() => {
    if (tab === '3d' || tab === 'meridional-editor' || tab === 'meridional-drag') markStep('geometria')
    if (['curves', 'velocity', 'losses', 'stress', 'pressure', 'multispeed', 'spanwise', 'noise'].includes(tab)) markStep('analise')
    if (['optimize', 'doe', 'pareto'].includes(tab)) markStep('otimizacao')
  }, [tab, markStep])

  // Auto-restore handler (feature #10)
  const handleAutoRestore = useCallback(() => {
    try {
      const raw = localStorage.getItem('hpe_autosave')
      if (raw) {
        const state = JSON.parse(raw)
        if (state.opPoint) setOpPoint(state.opPoint)
        if (state.tab) setTab(state.tab)
        toast('Sessao anterior restaurada', 'success')
      }
    } catch { /* ignore */ }
    setShowAutoRestore(false)
  }, [toast])

  // Duplicate version handler (feature #4)
  const handleDuplicateVersion = useCallback((v: VersionEntry) => {
    const qH = v.flow_rate >= 1 ? v.flow_rate : v.flow_rate * 3600
    setOpPoint({ flowRate: qH, head: v.head, rpm: v.rpm })
    toast('Ponto de operacao copiado — clique Executar para criar nova versao', 'info')
  }, [toast])

  // Warning count for sidebar badge (feature #8)
  const warningCount = sizing?.warnings?.length || 0

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
      if (r.ok) { const d = await r.json(); setSavedId(d.id); toast('Design salvo no projeto', 'success'); logAction('Design salvo', currentProject?.name) }
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
      // Save previous sizing for delta indicators
      setPreviousSizing(sizing)
      setSizing(result)
      setOpPoint({ flowRate: q, head: h, rpm: n })
      setSavedId(null)

      // Push to calculation history (max 10, FIFO)
      setHistory(prev => {
        const entry: HistoryEntry = {
          id: Date.now(),
          timestamp: new Date(),
          flowRate: q,
          head: h,
          rpm: n,
          nq: result.specific_speed_nq,
          eta: result.estimated_efficiency,
          d2: result.impeller_d2 * 1000,
        }
        return [entry, ...prev].slice(0, 10)
      })

      // 2. Secondary data — sequential to avoid middleware serialization deadlock
      const curvesData = await getCurves(qm3s, h, n).catch(() => ({ points: [] }))
      setCurves(curvesData.points || [])

      const lossData = await getLossBreakdown(qm3s, h, n).catch(() => null)
      setLosses(lossData)

      const stressData = await runStressAnalysis(qm3s, h, n).catch(() => null)
      setStress(stressData)

      // Auto-save as version
      try {
        const ver = await saveVersion(
          { flow_rate: qm3s, head: h, rpm: n },
          result,
          currentProject?.id || undefined,
        )
        setVersions(prev => [ver, ...prev])
        setCurrentVersionId(ver.id)
      } catch { /* version save is best-effort */ }

      toast('Dimensionamento concluido', 'success')
      incrementSizingCount()
      logAction('Dimensionamento executado', `Q=${q} m3/h H=${h}m n=${n}rpm`)

      // Proactive suggestions (#4) — delayed to not overlap loading toast
      setTimeout(() => {
        if (result.estimated_efficiency < 0.75) {
          toast('eta abaixo de 75%. Tente aumentar o numero de pas ou ajustar beta2.', 'warning')
        }
        if (result.estimated_npsh_r > 8) {
          toast(`NPSHr=${result.estimated_npsh_r.toFixed(1)}m e alto. Reduza RPM para ~${Math.round(n * 0.85)}.`, 'warning')
        }
        if (result.specific_speed_nq < 10) {
          toast('Nq muito baixo -- considere multi-estagio ou aumente RPM.', 'info')
        }
        if (result.specific_speed_nq > 200) {
          toast('Nq alto -- considere bomba axial ou mixed-flow.', 'info')
        }
      }, 2000)

      // Inline tutorial (#6) — compare with previous on 2nd-4th runs
      if (sizing && history.length >= 1 && history.length <= 3) {
        setTimeout(() => {
          if (result.estimated_efficiency > (sizing?.estimated_efficiency || 0)) {
            toast('eta aumentou! A mudanca melhorou o projeto.', 'success')
          } else if (sizing && result.estimated_efficiency < sizing.estimated_efficiency) {
            toast('eta diminuiu. Tente ajustar outros parametros.', 'info')
          }
        }, 3500)
      }

      // Encouragement (#9)
      setTimeout(() => {
        const eta = result.estimated_efficiency
        const msgs_excellent = ['Excelente projeto!', 'Top 10% para este Nq!', 'Projeto de referencia!']
        const msgs_good = ['Bom projeto!', 'Parametros bem equilibrados.', 'Design solido.']
        const msgs_ok = ['Aceitavel. Pequenos ajustes podem melhorar.', 'Bom ponto de partida para otimizacao.']
        const msgs_bad = ['Nao desanime! Ajuste os parametros.', 'Tente variar RPM ou numero de pas.']
        const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
        if (eta > 0.85) toast(pick(msgs_excellent), 'success')
        else if (eta > 0.78) toast(pick(msgs_good), 'success')
        else if (eta > 0.70) toast(pick(msgs_ok), 'info')
        else toast(pick(msgs_bad), 'info')
      }, 4500)
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
    onEscape: () => { setCmdOpen(false); setShortcutsHelpOpen(false); setHelpOpen(false); setTimelineOpen(false) },
    onF1Help: () => setHelpOpen(v => !v),
    onExport: () => setExportCenterOpen(true),
  })

  // History restore handler
  const handleHistoryRestore = (entry: HistoryEntry) => {
    setOpPoint({ flowRate: entry.flowRate, head: entry.head, rpm: entry.rpm })
    handleRunSizing(entry.flowRate, entry.head, entry.rpm)
  }

  // Version handlers
  const handleVersionSelect = (v: VersionEntry) => {
    setCurrentVersionId(v.id)
    // flow_rate from backend is in m3/s, convert to m3/h for the form
    const qH = v.flow_rate >= 1 ? v.flow_rate : v.flow_rate * 3600
    setOpPoint({ flowRate: qH, head: v.head, rpm: v.rpm })
    handleRunSizing(qH, v.head, v.rpm)
  }

  const handleVersionCompare = async (a: VersionEntry, b: VersionEntry) => {
    try {
      const result = await compareVersions(a.id, b.id)
      setCompareData(result)
    } catch {
      toast('Erro ao comparar versoes', 'error')
    }
  }

  const handleVersionDelete = async (id: string) => {
    try {
      await apiDeleteVersion(id)
      setVersions(prev => prev.filter(v => v.id !== id))
      if (currentVersionId === id) setCurrentVersionId(null)
    } catch {
      toast('Erro ao excluir versao', 'error')
    }
  }

  /* Shared overlay elements rendered in all authenticated pages */
  const overlays = (
    <>
      {ctxMenu && (
        <GlobalContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onRecalculate={() => handleRunSizing(opPoint.flowRate, opPoint.head, opPoint.rpm)}
          onExport={() => setExportCenterOpen(true)}
          onHelp={() => setHelpOpen(v => !v)}
        />
      )}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={handleNavigate}
        onRunSizing={handleRunSizingShortcut}
        onStartTour={() => setTourActive(true)}
        onGlossary={() => setGlossaryOpen(true)}
        sizing={sizing}
      />
      <Toast messages={toasts} onDismiss={dismiss} />
      {showWhatsNew && page !== 'login' && (
        <WhatsNew onClose={() => { setShowWhatsNew(false); localStorage.setItem('hpe_whats_new_seen', '0.2.0') }} />
      )}
      {showAutoRestore && page !== 'login' && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
          borderRadius: 8, padding: '10px 16px', zIndex: 2000,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Sessao anterior encontrada. Restaurar?</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={handleAutoRestore}>Restaurar</button>
          <button onClick={() => setShowAutoRestore(false)} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
          }}>x</button>
        </div>
      )}
      {shortcutsHelpOpen && <ShortcutsHelpModal onClose={() => setShortcutsHelpOpen(false)} />}
      <GuidedTour active={tourActive} onComplete={() => setTourActive(false)} onNavigate={handleNavigate} />
      {compareData && <VersionCompareModal data={compareData} onClose={() => setCompareData(null)} />}
      <FloatingMetrics sizing={sizing} resultsRef={resultsRef} />
      <ContextualHelp open={helpOpen} onClose={() => setHelpOpen(false)} currentTab={tab} />
      <ActionTimeline entries={timeline} open={timelineOpen} onClose={() => setTimelineOpen(false)} />
      <Glossary open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
      <ExportCenter
        open={exportCenterOpen}
        onClose={() => setExportCenterOpen(false)}
        sizing={sizing}
        opPoint={sizing ? opPoint : undefined}
        projectName={currentProject?.name}
        onExport={(format) => {
          setExportCenterOpen(false)
          const q = opPoint.flowRate / 3600
          const h = opPoint.head
          const n = opPoint.rpm
          const downloadBlob = (blob: Blob, filename: string) => {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = filename; a.click()
            URL.revokeObjectURL(url)
          }
          const downloadText = (text: string, filename: string) => {
            downloadBlob(new Blob([text], { type: 'text/plain' }), filename)
          }
          switch (format) {
            case 'step':
              fetch(`/api/v1/geometry/export/step?flow_rate=${q}&head=${h}&rpm=${n}`)
                .then(r => r.blob()).then(b => downloadBlob(b, 'impeller.step'))
                .catch(() => toast('Erro ao exportar STEP', 'error'))
              break
            case 'iges':
              fetch(`/api/v1/geometry/export/iges?flow_rate=${q}&head=${h}&rpm=${n}`)
                .then(r => r.blob()).then(b => downloadBlob(b, 'impeller.iges'))
                .catch(() => toast('Erro ao exportar IGES', 'error'))
              break
            case 'stl':
              fetch(`/api/v1/geometry/export/stl?flow_rate=${q}&head=${h}&rpm=${n}`)
                .then(r => r.blob()).then(b => downloadBlob(b, 'impeller.stl'))
                .catch(() => toast('Erro ao exportar STL', 'error'))
              break
            case 'gltf':
              handleNavigate('design', '3d')
              toast('Use o botao glTF no viewer 3D', 'info')
              break
            case 'bladegen':
              fetch(`/api/v1/geometry/export/bladegen?flow_rate=${q}&head=${h}&rpm=${n}`)
                .then(r => r.json()).then(d => { if (d.inf) downloadText(d.inf, 'blade.inf') })
                .catch(() => toast('Erro ao exportar BladeGen', 'error'))
              break
            case 'geo':
              fetch(`/api/v1/geometry/export/geo?flow_rate=${q}&head=${h}&rpm=${n}`)
                .then(r => r.json()).then(d => { if (d.ps) downloadText(d.ps, 'blade_ps.geo') })
                .catch(() => toast('Erro ao exportar GEO', 'error'))
              break
            case 'cfx-package':
              fetch('/api/v1/cfd/cfx/package', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ flow_rate: q, head: h, rpm: n }) })
                .then(r => r.blob()).then(b => downloadBlob(b, 'cfx_package.zip'))
                .catch(() => toast('Erro ao exportar CFX', 'error'))
              break
            case 'fluent':
              fetch('/api/v1/cfd/fluent/journal', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ flow_rate: q, head: h, rpm: n }) })
                .then(r => r.text()).then(t => downloadText(t, 'setup.jou'))
                .catch(() => toast('Erro ao exportar Fluent', 'error'))
              break
            case 'openfoam':
              fetch('/api/v1/cfd/openfoam/case', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ flow_rate: q, head: h, rpm: n }) })
                .then(r => r.blob()).then(b => downloadBlob(b, 'openfoam_case.zip'))
                .catch(() => toast('Erro ao exportar OpenFOAM', 'error'))
              break
            case 'pdf':
              fetch('/api/v1/report/pdf', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ flow_rate: q, head: h, rpm: n }) })
                .then(r => r.blob()).then(b => downloadBlob(b, 'hpe_relatorio.pdf'))
                .catch(() => toast('Erro ao exportar PDF', 'error'))
              break
            case 'csv':
              if (sizing) {
                import('./services/api').then(({ exportSizingCSV }) => exportSizingCSV(sizing, opPoint))
              }
              break
            case 'png':
              handleNavigate('design', '3d')
              toast('Use o botao PNG no viewer 3D', 'info')
              break
            case 'email':
              if (sizing) emailResults(sizing, opPoint, currentProject?.name)
              break
            default:
              toast(`Formato ${format} em desenvolvimento`, 'info')
          }
          markStep('exportar')
        }}
      />
    </>
  )

  // Recent tabs for SubTabBar dot indicators (last 3 unique, excluding current)
  const recentTabs = [...new Set(tabHistory.slice(-6).reverse())].filter(t => t !== tab).slice(0, 3)

  // === LOGIN ===
  if (page === 'login') {
    return <LoginPage onLogin={handleLogin} />
  }

  // === PROJECTS ===
  if (page === 'projects') {
    return (
      <Layout page="projects" activeTab={null} userName={user?.name || t.user}
        onNavigate={handleNavigate} onLogout={handleLogout} warningCount={warningCount}>
        <ProjectsPage onSelectProject={handleSelectProject} token={token} />
        <StatusBar sizing={sizing} previousSizing={previousSizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} onTimeline={() => setTimelineOpen(v => !v)} />
        {overlays}
      </Layout>
    )
  }

  // Tabs that need full width (no 2-column layout with SizingForm)
  const WIDE_TABS: Tab[] = ['3d', 'meridional-drag', 'meridional-editor', 'lete', 'lean-sweep', 'doe', 'pareto', 'batch', 'templates', 'compare', 'optimize']

  // === DESIGN — 3D viewer (now with sub-tabs visible) ===
  if (tab === '3d') {
    return (
      <Layout page="design" activeTab={tab} userName={user?.name || t.user}
        projectName={currentProject?.name} onNavigate={handleNavigate} onLogout={handleLogout} warningCount={warningCount} recentTabs={recentTabs}>
        <ImpellerViewer
          flowRate={opPoint.flowRate}
          head={opPoint.head}
          rpm={opPoint.rpm}
          fullscreen
          loading={loading}
          sizing={sizing}
          onRunSizing={handleRunSizing}
          onToast={toast}
        />
        <StatusBar sizing={sizing} previousSizing={previousSizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} onTimeline={() => setTimelineOpen(v => !v)} />
        {overlays}
      </Layout>
    )
  }

  // === DESIGN — wide tabs (editors, optimization, etc.) ===
  if (WIDE_TABS.includes(tab) && tab !== '3d') {
    return (
      <Layout page="design" activeTab={tab} userName={user?.name || t.user}
        projectName={currentProject?.name} onNavigate={handleNavigate} onLogout={handleLogout} warningCount={warningCount} recentTabs={recentTabs}>
        <div>
          {tab === 'templates' && (
            <TemplateSelector loading={loading} onSelect={(tmpl: any) => {
              if (tmpl.flow_rate && tmpl.head && tmpl.rpm) {
                // Navigate to results tab so user sees the computation
                handleNavigate('design', 'results')
                handleRunSizing(tmpl.flow_rate, tmpl.head, tmpl.rpm)
              }
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
          {tab === 'optimize' && (
            <>
              <OptimizationPresets defaultFlowRate={opPoint.flowRate} defaultHead={opPoint.head} defaultRpm={opPoint.rpm} />
              <OptimizePanel defaultFlowRate={opPoint.flowRate} defaultHead={opPoint.head} defaultRpm={opPoint.rpm} />
              <FeedbackStars tab="optimize" />
            </>
          )}
          {!sizing && tab !== 'templates' && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Execute um dimensionamento primeiro para usar esta funcionalidade.
            </div>
          )}
        </div>
        <StatusBar sizing={sizing} previousSizing={previousSizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} onTimeline={() => setTimelineOpen(v => !v)} />
        {overlays}
      </Layout>
    )
  }

  // === DESIGN — standard 2-column layout (sizing form + results) ===
  return (
    <Layout page="design" activeTab={tab} userName={user?.name || t.user}
      projectName={currentProject?.name} onNavigate={handleNavigate} onLogout={handleLogout}
      onRecalculate={sizing ? () => handleRunSizing(opPoint.flowRate, opPoint.head, opPoint.rpm) : undefined}
      onExport={sizing ? () => setExportCenterOpen(true) : undefined}
      onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}>

      {/* Progress Stepper — removed: sub-tabs already serve the same purpose */}

      <div className="content-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => handleNavigate('projects')}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 13, padding: 0,
              fontFamily: 'var(--font-family)', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
          >
            &larr; Projetos
          </button>
          <span style={{ color: 'var(--border-primary)', fontSize: 14, userSelect: 'none' }}>/</span>
          <h1 style={{ fontSize: 18, margin: 0 }}>{currentProject?.name || t.quickDesign}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sizing && <DesignQualityBadge sizing={sizing} />}
          <VersionPanel
            versions={versions}
            currentVersionId={currentVersionId}
            onSelect={handleVersionSelect}
            onCompare={handleVersionCompare}
            onDelete={handleVersionDelete}
            onDuplicate={handleDuplicateVersion}
          />
          <button
            type="button"
            onClick={() => setExportCenterOpen(true)}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 4,
              border: '1px solid var(--border-primary)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            Exportar
          </button>
        </div>
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
              setSavedId(null)
            }}
            loading={loading}
            setLoading={setLoading}
            extFlowRate={opPoint.flowRate}
            extHead={opPoint.head}
            extRpm={opPoint.rpm}
          />
          <ExportPanel sizing={sizing} op={sizing ? opPoint : null} curves={curves} projectName={currentProject?.name} onExported={() => markStep('exportar')} />
          {sizing && (
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <ProjectChecklist
                hasSizing={completedSteps.includes('sizing')}
                hasViewedGeometry={completedSteps.includes('geometria')}
                hasViewedAnalysis={completedSteps.includes('analise')}
                hasCheckedNpsh={completedSteps.includes('sizing')}
                hasExported={completedSteps.includes('exportar')}
              />
            </div>
          )}
        </div>

        {/* RIGHT PANEL — results area */}
        <div ref={resultsRef}>
          {/* Section guide (#2) */}
          <SectionGuide tab={tab} />

          {/* Quick Summary tab (#9) */}
          {tab === 'overview' && sizing && (
            <QuickSummary sizing={sizing} curves={curves} opPoint={opPoint} onNavigate={(t) => handleNavigate('design', t as Tab)} />
          )}

          {sizing ? (
            <>
              {/* Overview toggle (#10) */}
              {tab === 'results' && (
                <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                  <button onClick={() => setOverviewTab(false)} style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${!overviewTab ? 'var(--accent)' : 'var(--border-primary)'}`,
                    background: !overviewTab ? 'rgba(0,160,223,0.15)' : 'transparent',
                    color: !overviewTab ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 500, transition: 'all 0.15s',
                  }}>Detalhado</button>
                  <button onClick={() => setOverviewTab(true)} style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${overviewTab ? 'var(--accent)' : 'var(--border-primary)'}`,
                    background: overviewTab ? 'rgba(0,160,223,0.15)' : 'transparent',
                    color: overviewTab ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 500, transition: 'all 0.15s',
                  }}>Visao Geral</button>
                  <button onClick={() => setGlossaryOpen(true)} style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                    border: '1px solid var(--border-primary)', background: 'transparent',
                    color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.15s',
                    marginLeft: 'auto',
                  }}>Glossario</button>
                </div>
              )}

              {/* Complete result single-page view (#10) */}
              {tab === 'results' && overviewTab && (
                <CompleteResultView
                  sizing={sizing}
                  curves={curves}
                  losses={losses}
                  stress={stress}
                  opPoint={opPoint}
                  onNavigateTab={(t: string) => { setOverviewTab(false); handleNavigate('design', t as Tab) }}
                />
              )}

              {/* Results: dashboard overview + detailed results + reference */}
              {tab === 'results' && !overviewTab && (
                <>
                  <DesignDashboard
                    sizing={sizing}
                    previousSizing={previousSizing}
                    opPoint={opPoint}
                    onNavigate={(t) => handleNavigate('design', t)}
                    onRunSizing={handleRunSizing}
                    onWhatIf={(newD2mm) => {
                      // Quick-compare: re-run sizing isn't possible without backend,
                      // so we just trigger a toast with the projected value
                      toast(`D2 alterado para ${newD2mm.toFixed(0)}mm — execute novamente para aplicar`, 'info')
                    }}
                  />
                  <div style={{ marginTop: 16 }}>
                    <ResultsView sizing={sizing} previousSizing={previousSizing} />
                  </div>
                  <ReferencePanel sizing={sizing} />
                </>
              )}
              {tab === 'curves' && (
                <>
                  <CurvesChart points={curves} designFlow={opPoint.flowRate / 3600} designHead={opPoint.head} />
                  <div style={{ marginTop: 24 }}>
                    <EfficiencyMap flowRate={opPoint.flowRate} head={opPoint.head} rpm={opPoint.rpm} />
                  </div>
                  <FeedbackStars tab="curves" />
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
          ) : loading ? (
            /* Loading skeleton — shown while sizing is computing */
            <ResultsSkeleton />
          ) : (
            /* Empty state — simple prompt to run sizing */
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: 12 }}>
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Pronto para calcular
              </div>
              <div style={{ fontSize: 13, maxWidth: 300, margin: '0 auto', lineHeight: 1.5 }}>
                Preencha Q, H e n à esquerda e clique em <span style={{ color: 'var(--accent)', fontWeight: 500 }}>Executar Dimensionamento</span>
              </div>
            </div>
          )}
          <NextStepBanner currentTab={tab} hasSizing={!!sizing} onNavigate={(t) => handleNavigate('design', t)} />
        </div>
      </div>
      <StatusBar sizing={sizing} previousSizing={previousSizing} opPoint={sizing ? opPoint : undefined} savedId={savedId} onShortcutsHelp={() => setShortcutsHelpOpen(true)} onTimeline={() => setTimelineOpen(v => !v)} />
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
    { keys: 'Ctrl+E', desc: 'Abrir Export Center' },
    { keys: 'F1', desc: 'Ajuda contextual' },
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
