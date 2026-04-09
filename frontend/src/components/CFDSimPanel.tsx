/**
 * CFDSimPanel — Simulação CFD completa da bomba.
 *
 * Permite configurar e executar um sweep CFD (curva H-Q),
 * exibir curva de desempenho em SVG e monitorar convergência.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import CFDFieldViewer from './CFDFieldViewer'

interface Props {
  /** Vazão BEP em m³/h (do opPoint) */
  flowRate: number
  /** Altura BEP em m */
  head: number
  /** Rotação em RPM */
  rpm: number
  sizing?: {
    specific_speed_nq: number
    impeller_d2: number
    impeller_b2: number
    beta1: number
    beta2: number
    blade_count: number
    estimated_efficiency: number
  }
}

// ── API response shapes ─────────────────────────────────────────────────────

interface SweepPoint {
  fraction: number
  Q: number
  H_target?: number
  H_cfd?: number
  eta_cfd?: number
  P_shaft?: number
  converged: boolean
  error?: string
}

interface PumpCurve {
  Q_pts: number[]
  H_pts: number[]
  eta_pts: number[]
  P_pts: number[]
  bep?: { Q: number; H: number; eta: number; P_shaft: number }
  npsh_r_bep?: number
}

interface SweepResult {
  n_planned: number
  n_converged: number
  points: SweepPoint[]
  pump_curve?: PumpCurve
}

interface SingleCFDResult {
  H_cfd?: number
  eta_cfd?: number
  P_shaft?: number
  converged: boolean
  ran_simulation: boolean
  training_log_id?: string
}

type PanelState = 'idle' | 'running' | 'completed' | 'failed'
type RunMode = 'single' | 'sweep'

// ── Component ───────────────────────────────────────────────────────────────

export default function CFDSimPanel({ flowRate, head, rpm, sizing }: Props) {
  // Config state
  const [runMode, setRunMode] = useState<RunMode>('single')
  const [meshMode, setMeshMode] = useState('snappy')
  const [turbulence, setTurbulence] = useState('kEpsilon')
  const [nProcs, setNProcs] = useState('1')
  const [nIter, setNIter] = useState('500')
  const [runSolver, setRunSolver] = useState(false)

  // Panel state
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [singleResult, setSingleResult] = useState<SingleCFDResult | null>(null)
  const [sweepResult, setSweepResult] = useState<SweepResult | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [residuals, setResiduals] = useState<{ iteration: number; fields: Record<string, number> }[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const canRun = flowRate > 0 && head > 0 && rpm > 0

  // Subscribe to residuals WebSocket when we have an active run_id and solver is running
  useEffect(() => {
    if (!activeRunId || !runSolver) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/cfd/${activeRunId}/residuals`)
    wsRef.current = ws

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.residuals && Object.keys(msg.residuals).length > 0) {
          setResiduals(prev => {
            const next = [...prev, { iteration: msg.iteration, fields: msg.residuals }]
            return next.slice(-200)   // cap at 200 points
          })
        }
        if (msg.reason && msg.reason !== 'running') {
          appendLog(`Convergência: ${msg.reason} (iter ${msg.iteration})`)
        }
      } catch { /* ignore parse errors */ }
    }
    ws.onerror = () => appendLog('WebSocket resíduos: erro de conexão')

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [activeRunId, runSolver])   // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadReport = useCallback(async () => {
    try {
      appendLog('Gerando relatório PDF…')
      const body: Record<string, unknown> = {
        project_name: 'HPE CFD Simulation',
        format: 'auto',
        sizing: sizing,
      }
      if (singleResult) body['cavitation'] = { npsh_r: 2.5, npsh_a: 5.0, risk_level: 'safe', recommendations: [] }

      const resp = await fetch('/api/v1/cfd/advanced/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `HPE_CFD_Report.${blob.type.includes('pdf') ? 'pdf' : blob.type.includes('html') ? 'html' : 'md'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      appendLog('Relatório baixado.')
    } catch (err) {
      appendLog(`Erro ao gerar relatório: ${err}`)
    }
  }, [sizing, singleResult])

  const handleStop = useCallback(async () => {
    if (!activeRunId) return
    try {
      await fetch(`/api/v1/cfd/run/${activeRunId}`, { method: 'DELETE' })
      appendLog(`Stop solicitado para run_id=${activeRunId}`)
      wsRef.current?.close()
      setPanelState('failed')
      setError('Simulação cancelada pelo usuário.')
    } catch (err) {
      appendLog(`Erro ao cancelar: ${err}`)
    }
  }, [activeRunId])

  const appendLog = (msg: string) => {
    setLogLines(prev => {
      const next = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]
      return next.slice(-80)  // cap at 80 lines
    })
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 50)
  }

  const handleRun = useCallback(async () => {
    setError(null)
    setPanelState('running')
    setSingleResult(null)
    setSweepResult(null)
    setLogLines([])
    setActiveRunId(null)
    setResiduals([])

    appendLog(`Iniciando simulação CFD (modo=${runMode}, mesh=${meshMode}, turb=${turbulence})`)
    appendLog(`Q=${(flowRate / 3600).toFixed(4)} m³/s  H=${head} m  n=${rpm} RPM`)

    try {
      if (runMode === 'single') {
        await _runSingle()
      } else {
        await _runSweep()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      appendLog(`ERRO: ${msg}`)
      setError(msg)
      setPanelState('failed')
    }

    async function _runSingle() {
      // Step 1: /cfd/setup — creates case and returns run_id
      appendLog('Configurando caso CFD (/cfd/setup)…')
      const setupResp = await fetch('/api/v1/cfd/setup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          flow_rate: flowRate / 3600,
          head,
          rpm,
          n_procs:   parseInt(nProcs) || 1,
        }),
      })
      if (!setupResp.ok) throw new Error(`Setup HTTP ${setupResp.status}: ${await setupResp.text()}`)
      const setup = await setupResp.json()
      const runId: string = setup.run_id
      setActiveRunId(runId)
      appendLog(`Caso criado — run_id=${runId}`)

      // If run_solver is disabled, just show dry-run result from setup
      if (!runSolver) {
        appendLog('Dry-run: solver não executado (marque "Executar solver" para rodar OpenFOAM)')
        setSingleResult({ converged: false, ran_simulation: false })
        setPanelState('completed')
        return
      }

      // Step 2: /cfd/run — executes the solver
      appendLog('Executando solver (/cfd/run)…')
      const runResp = await fetch('/api/v1/cfd/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ run_id: runId }),
      })
      if (!runResp.ok) throw new Error(`Run HTTP ${runResp.status}: ${await runResp.text()}`)
      const runData = await runResp.json()

      const results = runData.results ?? {}
      const data: SingleCFDResult = {
        H_cfd:          results.head,
        eta_cfd:        results.efficiency,
        P_shaft:        results.power != null ? results.power * 1000 : undefined,
        converged:      runData.status === 'completed',
        ran_simulation: true,
        training_log_id: runId,
      }
      appendLog(`Concluído — converged=${data.converged}`)
      if (data.H_cfd != null) appendLog(`H_cfd=${data.H_cfd.toFixed(2)} m  η=${((data.eta_cfd ?? 0) * 100).toFixed(1)}%  P=${((data.P_shaft ?? 0) / 1000).toFixed(1)} kW`)
      setSingleResult(data)
      setPanelState('completed')
    }

    async function _runSweep() {
      appendLog('Iniciando sweep H-Q (9 pontos 50%–130% BEP)…')
      const resp = await fetch('/api/v1/cfd/sweep', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          flow_rate:         flowRate / 3600,
          head,
          rpm,
          mesh_mode:         meshMode,
          turbulence_model:  turbulence,
          n_procs:           parseInt(nProcs) || 1,
          n_iter:            parseInt(nIter) || 500,
          run_solver:        runSolver,
          max_workers:       1,
          flow_fractions:    [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3],
        }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      const data = await resp.json()
      const pts: SweepPoint[] = data.points ?? []
      const conv = pts.filter(p => p.converged).length
      appendLog(`Sweep concluído: ${conv}/${pts.length} pontos convergidos`)
      setSweepResult(data)
      setPanelState('completed')
    }
  }, [flowRate, head, rpm, runMode, meshMode, turbulence, nProcs, nIter, runSolver])

  const handleReset = () => {
    setPanelState('idle')
    setSingleResult(null)
    setSweepResult(null)
    setLogLines([])
    setError(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Config ─────────────────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <h4 style={headingStyle}>Configuração da Simulação</h4>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['single', 'sweep'] as RunMode[]).map(m => (
            <button
              key={m}
              onClick={() => setRunMode(m)}
              style={{
                padding: '5px 14px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--border-primary)',
                background: runMode === m ? 'var(--accent)' : 'transparent',
                color:      runMode === m ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {m === 'single' ? 'Ponto único' : 'Sweep H-Q'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Malha</label>
            <select className="input" value={meshMode} onChange={e => setMeshMode(e.target.value)}
                    style={{ width: '100%', fontSize: 13 }}>
              <option value="snappy">snappyHexMesh</option>
              <option value="structured_blade">Malha estruturada (blade-to-blade)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Modelo de turbulência</label>
            <select className="input" value={turbulence} onChange={e => setTurbulence(e.target.value)}
                    style={{ width: '100%', fontSize: 13 }}>
              <option value="kEpsilon">k-ε padrão</option>
              <option value="kOmegaSST">k-ω SST</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Processos MPI</label>
            <input type="number" className="input" min="1" max="64"
                   value={nProcs} onChange={e => setNProcs(e.target.value)}
                   style={{ width: '100%', fontSize: 13 }} />
          </div>
          <div>
            <label style={labelStyle}>Iterações</label>
            <input type="number" className="input" min="50" max="5000" step="50"
                   value={nIter} onChange={e => setNIter(e.target.value)}
                   style={{ width: '100%', fontSize: 13 }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" id="run-solver" checked={runSolver}
                 onChange={e => setRunSolver(e.target.checked)} />
          <label htmlFor="run-solver" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
            Executar solver (requer OpenFOAM instalado)
          </label>
        </div>

        {!runSolver && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12,
                        padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
            Modo dry-run: caso CFD é montado mas o solver não é invocado.
            Útil para validar configuração sem OpenFOAM instalado.
          </div>
        )}

        {!canRun && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
            Preencha Q, H e n no ponto de operação antes de simular.
          </p>
        )}

        {(panelState === 'idle' || panelState === 'failed') ? (
          <button
            className="btn-primary"
            onClick={handleRun}
            disabled={!canRun}
            style={{ fontSize: 13, padding: '8px 20px' }}
          >
            {runMode === 'single' ? 'Simular ponto BEP' : 'Executar Sweep H-Q'}
          </button>
        ) : panelState === 'running' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Spinner />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {runSolver ? 'Simulando (pode levar minutos)…' : 'Montando caso CFD…'}
            </span>
            {activeRunId && runSolver && (
              <button
                onClick={handleStop}
                style={{
                  fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                  background: 'transparent', border: '1px solid #ef4444', color: '#ef4444',
                }}
              >
                Parar
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={handleReset}
            style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 12px',
                     background: 'transparent', border: '1px solid var(--border-primary)',
                     borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            Nova simulação
          </button>
        )}

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444', wordBreak: 'break-word' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Log console ────────────────────────────────────────────────────── */}
      {logLines.length > 0 && (
        <div style={cardStyle}>
          <h4 style={headingStyle}>Console</h4>
          <div
            ref={logRef}
            style={{
              background: 'var(--bg-secondary)', borderRadius: 4, padding: '10px 12px',
              fontSize: 11, fontFamily: 'monospace', color: 'var(--text-primary)',
              maxHeight: 160, overflowY: 'auto', lineHeight: 1.6,
            }}
          >
            {logLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* ── Residuals chart ───────────────────────────────────────────────── */}
      {residuals.length > 1 && (
        <div style={cardStyle}>
          <h4 style={headingStyle}>Resíduos de convergência</h4>
          <ResidualsChart residuals={residuals} />
        </div>
      )}

      {/* ── Report download (quando completed) ───────────────────────────── */}
      {panelState === 'completed' && (singleResult || sweepResult) && (
        <button
          onClick={handleDownloadReport}
          style={{
            alignSelf: 'flex-start',
            fontSize: 12,
            padding: '6px 14px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          📄 Baixar relatório técnico
        </button>
      )}

      {/* ── Single result ──────────────────────────────────────────────────── */}
      {panelState === 'completed' && singleResult && (
        <div style={cardStyle}>
          <h4 style={headingStyle}>Resultado — Ponto BEP</h4>
          <ConvergenceBadge converged={singleResult.converged} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
            <MetricCard label="H_cfd" value={singleResult.H_cfd != null ? `${singleResult.H_cfd.toFixed(2)} m` : '—'} />
            <MetricCard label="η_cfd" value={singleResult.eta_cfd != null ? `${(singleResult.eta_cfd * 100).toFixed(1)} %` : '—'} />
            <MetricCard label="P_shaft" value={singleResult.P_shaft != null ? `${(singleResult.P_shaft / 1000).toFixed(2)} kW` : '—'} />
            <MetricCard label="Solver executado" value={singleResult.ran_simulation ? 'Sim' : 'Não (dry-run)'} />
          </div>
          {singleResult.training_log_id && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
              Salvo no training_log: <code>{singleResult.training_log_id}</code>
            </p>
          )}
        </div>
      )}

      {/* ── CFD field viewer (quando há resultado) ────────────────────────── */}
      {panelState === 'completed' && (singleResult || sweepResult) && (
        <CFDFieldViewer caseDir={activeRunId || undefined} />
      )}

      {/* ── Sweep results ─────────────────────────────────────────────────── */}
      {panelState === 'completed' && sweepResult && (
        <>
          <div style={cardStyle}>
            <h4 style={headingStyle}>
              Sweep H-Q — {sweepResult.n_converged}/{sweepResult.n_planned} pontos convergidos
            </h4>
            <SweepTable points={sweepResult.points} />
          </div>

          {sweepResult.pump_curve && (
            <div style={cardStyle}>
              <h4 style={headingStyle}>Curva de Bomba</h4>
              <PumpCurveChart curve={sweepResult.pump_curve} bepQ={flowRate} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConvergenceBadge({ converged }: { converged: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, fontWeight: 600,
      color: converged ? '#22c55e' : '#f59e0b',
    }}>
      <span style={{ fontSize: 14 }}>{converged ? '✓' : '⚠'}</span>
      {converged ? 'Convergido' : 'Não convergido / dry-run'}
    </span>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function SweepTable({ points }: { points: SweepPoint[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
            {['Q (m³/h)', 'H_cfd (m)', 'η (%)', 'P (kW)', 'Status'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i} style={{
              borderBottom: '1px solid var(--border-subtle)',
              opacity: p.converged ? 1 : 0.5,
            }}>
              <td style={{ padding: '6px 8px' }}>{(p.Q * 3600).toFixed(1)}</td>
              <td style={{ padding: '6px 8px' }}>{p.H_cfd?.toFixed(2) ?? '—'}</td>
              <td style={{ padding: '6px 8px' }}>{p.eta_cfd != null ? (p.eta_cfd * 100).toFixed(1) : '—'}</td>
              <td style={{ padding: '6px 8px' }}>{p.P_shaft != null ? (p.P_shaft / 1000).toFixed(2) : '—'}</td>
              <td style={{ padding: '6px 8px' }}>
                <span style={{ color: p.converged ? '#22c55e' : '#f59e0b', fontSize: 11 }}>
                  {p.converged ? '✓ OK' : p.error ? `✗ ${p.error.slice(0, 30)}` : '⚠ n/c'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PumpCurveChart({ curve, bepQ }: { curve: PumpCurve; bepQ: number }) {
  const { Q_pts, H_pts, eta_pts } = curve
  if (Q_pts.length < 2) return <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dados insuficientes.</p>

  const W = 520, H = 220, PL = 48, PR = 48, PT = 12, PB = 32

  // Scales
  const qMin = Math.min(...Q_pts), qMax = Math.max(...Q_pts)
  const hMin = 0, hMax = Math.max(...H_pts) * 1.1
  const eMin = 0, eMax = 1.0

  const cx = (q: number) => PL + ((q - qMin) / (qMax - qMin || 1)) * (W - PL - PR)
  const cy_h = (h: number) => PT + (1 - (h - hMin) / (hMax - hMin || 1)) * (H - PT - PB)
  const cy_e = (e: number) => PT + (1 - (e - eMin) / (eMax - eMin || 1)) * (H - PT - PB)

  const hLine = Q_pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${cx(q).toFixed(1)},${cy_h(H_pts[i]).toFixed(1)}`).join(' ')
  const eLine = Q_pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${cx(q).toFixed(1)},${cy_e(eta_pts[i]).toFixed(1)}`).join(' ')

  const bepX = cx(bepQ / 3600)
  const bep = curve.bep

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* H–Q curve */}
      <path d={hLine} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {/* η–Q curve */}
      <path d={eLine} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5 2" />

      {/* BEP marker */}
      {bep && (
        <>
          <line x1={bepX} y1={PT} x2={bepX} y2={H - PB}
                stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 2" />
          <circle cx={bepX} cy={cy_h(bep.H)} r={4} fill="var(--accent)" />
          <circle cx={bepX} cy={cy_e(bep.eta)} r={4} fill="#22c55e" />
        </>
      )}

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--border-primary)" strokeWidth={1} />
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--border-primary)" strokeWidth={1} />

      {/* H ticks (left) */}
      {[0, 0.25, 0.5, 0.75, 1.0].map(f => {
        const v = hMin + (hMax - hMin) * f
        return (
          <text key={f} x={PL - 4} y={cy_h(v) + 4} fontSize={9}
                fill="var(--accent)" textAnchor="end">{v.toFixed(0)}</text>
        )
      })}
      {/* η ticks (right) */}
      {[0, 0.25, 0.5, 0.75, 1.0].map(f => (
        <text key={f} x={W - PR + 4} y={cy_e(f) + 4} fontSize={9}
              fill="#22c55e" textAnchor="start">{(f * 100).toFixed(0)}%</text>
      ))}

      {/* X ticks */}
      {[qMin, (qMin + qMax) / 2, qMax].map(q => (
        <text key={q} x={cx(q)} y={H - PB + 14} fontSize={9}
              fill="var(--text-muted)" textAnchor="middle">{(q * 3600).toFixed(0)}</text>
      ))}

      {/* Labels */}
      <text x={PL - 32} y={PT + (H - PT - PB) / 2} fontSize={10}
            fill="var(--accent)" textAnchor="middle"
            transform={`rotate(-90 ${PL - 32} ${PT + (H - PT - PB) / 2})`}>H (m)</text>
      <text x={W - PR + 32} y={PT + (H - PT - PB) / 2} fontSize={10}
            fill="#22c55e" textAnchor="middle"
            transform={`rotate(90 ${W - PR + 32} ${PT + (H - PT - PB) / 2})`}>η</text>
      <text x={PL + (W - PL - PR) / 2} y={H} fontSize={10}
            fill="var(--text-muted)" textAnchor="middle">Q (m³/h)</text>

      {/* Legend */}
      <line x1={W - PR - 80} y1={PT + 8} x2={W - PR - 64} y2={PT + 8}
            stroke="var(--accent)" strokeWidth={2} />
      <text x={W - PR - 60} y={PT + 12} fontSize={9} fill="var(--accent)">H–Q</text>
      <line x1={W - PR - 80} y1={PT + 22} x2={W - PR - 64} y2={PT + 22}
            stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5 2" />
      <text x={W - PR - 60} y={PT + 26} fontSize={9} fill="#22c55e">η–Q</text>
    </svg>
  )
}

function ResidualsChart({ residuals }: {
  residuals: { iteration: number; fields: Record<string, number> }[]
}) {
  if (residuals.length < 2) return null

  const W = 520, H = 160, PL = 52, PR = 12, PT = 8, PB = 28
  const iMin = residuals[0].iteration
  const iMax = residuals[residuals.length - 1].iteration

  // Collect all field names
  const fields = Array.from(new Set(residuals.flatMap(r => Object.keys(r.fields)))).slice(0, 6)
  const COLORS = ['var(--accent)', '#22c55e', '#f59e0b', '#a78bfa', '#fb923c', '#38bdf8']

  // Log scale: find global min/max (avoid log(0))
  const allVals = residuals.flatMap(r => Object.values(r.fields)).filter(v => v > 0)
  const vMin = Math.min(...allVals) / 2
  const vMax = Math.max(...allVals) * 2
  const logMin = Math.log10(Math.max(vMin, 1e-12))
  const logMax = Math.log10(Math.max(vMax, 1e-6))

  const cx = (iter: number) => PL + ((iter - iMin) / (iMax - iMin || 1)) * (W - PL - PR)
  const cy = (v: number) => {
    const lv = Math.log10(Math.max(v, 1e-12))
    return PT + (1 - (lv - logMin) / (logMax - logMin || 1)) * (H - PT - PB)
  }

  const yTicks = Array.from({ length: 4 }, (_, i) => logMin + (logMax - logMin) * i / 3)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Grid */}
      {yTicks.map(lt => (
        <line key={lt} x1={PL} y1={cy(10 ** lt)} x2={W - PR} y2={cy(10 ** lt)}
              stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="3 3" />
      ))}

      {/* Field lines */}
      {fields.map((field, fi) => {
        const pts = residuals.filter(r => r.fields[field] != null)
        if (pts.length < 2) return null
        const d = pts.map((r, i) => `${i === 0 ? 'M' : 'L'}${cx(r.iteration).toFixed(1)},${cy(r.fields[field]).toFixed(1)}`).join(' ')
        return <path key={field} d={d} fill="none" stroke={COLORS[fi]} strokeWidth={1.5} />
      })}

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--border-primary)" strokeWidth={1} />
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--border-primary)" strokeWidth={1} />

      {/* Y ticks (log scale) */}
      {yTicks.map(lt => (
        <text key={lt} x={PL - 4} y={cy(10 ** lt) + 4} fontSize={8}
              fill="var(--text-muted)" textAnchor="end">{`1e${lt.toFixed(0)}`}</text>
      ))}
      {/* X ticks */}
      {[iMin, Math.round((iMin + iMax) / 2), iMax].map(it => (
        <text key={it} x={cx(it)} y={H - PB + 12} fontSize={8}
              fill="var(--text-muted)" textAnchor="middle">{it}</text>
      ))}

      {/* Legend */}
      {fields.map((f, fi) => (
        <g key={f}>
          <line x1={PL + fi * 70} y1={H - 4} x2={PL + fi * 70 + 12} y2={H - 4}
                stroke={COLORS[fi]} strokeWidth={1.5} />
          <text x={PL + fi * 70 + 14} y={H} fontSize={8} fill={COLORS[fi]}>{f}</text>
        </g>
      ))}
    </svg>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14,
      border: '2px solid var(--border-primary)',
      borderTop: '2px solid var(--accent)',
      borderRadius: '50%',
      animation: 'cfd-spin 0.8s linear infinite',
      flexShrink: 0,
    }}>
      <style>{`@keyframes cfd-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-primary)',
  borderRadius: 8,
  padding: 16,
  background: 'var(--card-bg)',
}

const headingStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 4,
}
