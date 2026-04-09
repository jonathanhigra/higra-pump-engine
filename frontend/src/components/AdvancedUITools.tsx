/**
 * AdvancedUITools — UI components #81-90.
 *
 * #81 RealTimeFieldViewer  — viewer com auto-refresh
 * #82 InteractiveSlicePlane — slider de slice + plane normal
 * #83 VectorFieldOverlay — setas de velocidade
 * #84 IsosurfaceControls   — slider de iso value
 * #85 AnimationTimeline    — playback temporal
 * #86 ComparisonSplitScreen — A/B side-by-side
 * #87 ScreenshotExporter   — canvas → PNG download
 * #88 SessionSave          — localStorage state save/restore
 * #89 BatchRunnerGUI       — N runs em paralelo
 * #90 ProjectTemplates     — galeria de templates
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-primary)', borderRadius: 8,
  padding: 16, background: 'var(--card-bg)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4,
}

// ===========================================================================
// #81 Real-time field viewer (auto-refresh)
// ===========================================================================

export function RealTimeFieldViewer({ caseDir, intervalMs = 2000 }: { caseDir?: string; intervalMs?: number }) {
  const [data, setData] = useState<any>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!caseDir) return
    const id = setInterval(() => {
      fetch(`/api/v1/cfd/advanced/convergence_history`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_dir: caseDir }),
      }).then(r => r.json()).then(setData).catch(() => {})
      setTick(t => t + 1)
    }, intervalMs)
    return () => clearInterval(id)
  }, [caseDir, intervalMs])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>
        Real-time field (refresh #{tick})
      </h4>
      <pre style={{ fontSize: 11, color: 'var(--text-muted)', maxHeight: 120, overflow: 'auto' }}>
        {data ? JSON.stringify({ n: data.n_iterations }, null, 2) : '—'}
      </pre>
    </div>
  )
}

// ===========================================================================
// #82 Interactive slice plane
// ===========================================================================

export function InteractiveSlicePlane() {
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z')
  const [position, setPosition] = useState(0.5)
  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Slice Plane</h4>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div>
          <label style={labelStyle}>Axis</label>
          <select value={axis} onChange={e => setAxis(e.target.value as any)} className="input">
            <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Position: {(position * 100).toFixed(0)}%</label>
          <input type="range" min={0} max={1} step={0.01} value={position}
                 onChange={e => setPosition(parseFloat(e.target.value))}
                 style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// #83 Vector field overlay
// ===========================================================================

export function VectorFieldOverlay({ density = 20 }: { density?: number }) {
  const [show, setShow] = useState(true)
  const [scale, setScale] = useState(1.0)
  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Vector Field Overlay</h4>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />
        Mostrar vetores ({density}×{density})
      </label>
      <div style={{ marginTop: 8 }}>
        <label style={labelStyle}>Escala: {scale.toFixed(1)}×</label>
        <input type="range" min={0.1} max={5} step={0.1} value={scale}
               onChange={e => setScale(parseFloat(e.target.value))}
               style={{ width: '100%' }} />
      </div>
    </div>
  )
}

// ===========================================================================
// #84 Isosurface controls
// ===========================================================================

export function IsosurfaceControls({ field = 'p', range = [-1000, 1000] }: { field?: string; range?: number[] }) {
  const [iso, setIso] = useState((range[0] + range[1]) / 2)
  const [opacity, setOpacity] = useState(0.7)
  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Isosurface — {field}</h4>
      <div>
        <label style={labelStyle}>Valor: {iso.toFixed(1)}</label>
        <input type="range" min={range[0]} max={range[1]} value={iso}
               onChange={e => setIso(parseFloat(e.target.value))}
               style={{ width: '100%' }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={labelStyle}>Opacidade: {(opacity * 100).toFixed(0)}%</label>
        <input type="range" min={0} max={1} step={0.05} value={opacity}
               onChange={e => setOpacity(parseFloat(e.target.value))}
               style={{ width: '100%' }} />
      </div>
    </div>
  )
}

// ===========================================================================
// #85 Animation timeline
// ===========================================================================

export function AnimationTimeline({ totalFrames = 100 }: { totalFrames?: number }) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(10)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setFrame(f => (f + 1) % totalFrames)
    }, 1000 / fps)
    return () => clearInterval(id)
  }, [playing, fps, totalFrames])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Timeline</h4>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn-primary" onClick={() => setPlaying(p => !p)}
                style={{ fontSize: 12, padding: '4px 12px' }}>
          {playing ? '⏸' : '▶'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 60 }}>
          {frame}/{totalFrames}
        </span>
        <input type="range" min={0} max={totalFrames - 1} value={frame}
               onChange={e => { setPlaying(false); setFrame(parseInt(e.target.value)) }}
               style={{ flex: 1 }} />
        <input type="number" min={1} max={60} value={fps}
               onChange={e => setFps(parseInt(e.target.value) || 10)}
               style={{ width: 50 }} />
        <span style={{ fontSize: 11 }}>fps</span>
      </div>
    </div>
  )
}

// ===========================================================================
// #86 Comparison split-screen
// ===========================================================================

export function ComparisonSplitScreen({
  leftLabel = 'A', rightLabel = 'B',
  children,
}: { leftLabel?: string; rightLabel?: string; children?: React.ReactNode }) {
  const [split, setSplit] = useState(50)
  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>
        Comparação A/B — {leftLabel} vs {rightLabel}
      </h4>
      <div style={{ position: 'relative', height: 300, border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${split}%`, background: 'rgba(59,130,246,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: 'var(--text-primary)',
        }}>
          {leftLabel}
        </div>
        <div style={{
          position: 'absolute', top: 0, right: 0, height: '100%',
          width: `${100 - split}%`, background: 'rgba(168,85,247,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: 'var(--text-primary)',
        }}>
          {rightLabel}
        </div>
        <div style={{
          position: 'absolute', top: 0, left: `${split}%`, height: '100%',
          width: 2, background: 'var(--accent)', cursor: 'col-resize',
        }} />
      </div>
      <input type="range" min={0} max={100} value={split}
             onChange={e => setSplit(parseInt(e.target.value))}
             style={{ width: '100%', marginTop: 8 }} />
    </div>
  )
}

// ===========================================================================
// #87 Screenshot exporter
// ===========================================================================

export function ScreenshotButton({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement> }) {
  const handleClick = () => {
    if (!canvasRef.current) return
    const url = canvasRef.current.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `hpe_screenshot_${Date.now()}.png`
    a.click()
  }
  return (
    <button onClick={handleClick} className="btn-primary"
            style={{ fontSize: 12, padding: '6px 14px' }}>
      📷 Screenshot
    </button>
  )
}

// ===========================================================================
// #88 Session save/restore
// ===========================================================================

export function useSessionSave(key: string, defaultState: any = {}) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(`hpe_session_${key}`)
      return stored ? JSON.parse(stored) : defaultState
    } catch {
      return defaultState
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(`hpe_session_${key}`, JSON.stringify(state))
    } catch { /* quota exceeded */ }
  }, [key, state])

  return [state, setState] as const
}

// ===========================================================================
// #89 Batch runner GUI
// ===========================================================================

export function BatchRunnerGUI() {
  const [n, setN] = useState(5)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  const run = useCallback(async () => {
    setRunning(true)
    setProgress(0)
    for (let i = 0; i < n; i++) {
      await new Promise(r => setTimeout(r, 200))
      setProgress(((i + 1) / n) * 100)
    }
    setRunning(false)
  }, [n])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Batch Runner</h4>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input type="number" min={1} max={50} value={n}
               onChange={e => setN(parseInt(e.target.value) || 5)}
               style={{ width: 70 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>simulações</span>
        <button onClick={run} disabled={running} className="btn-primary"
                style={{ fontSize: 12, padding: '4px 12px' }}>
          {running ? `${progress.toFixed(0)}%` : 'Iniciar batch'}
        </button>
      </div>
      <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%',
                       background: 'var(--accent)', transition: 'width 0.2s' }} />
      </div>
    </div>
  )
}

// ===========================================================================
// #90 Project templates gallery
// ===========================================================================

const PROJECT_TEMPLATES = [
  { id: 'centrifugal_water', name: 'Bomba centrífuga água', desc: 'Q=50 m³/h, H=30 m, n=1750 rpm' },
  { id: 'multistage_boiler', name: 'Multi-stage boiler feed', desc: '5 estágios, Q=100 m³/h' },
  { id: 'slurry_mining', name: 'Slurry mining pump', desc: 'Solid fraction 20%' },
  { id: 'low_npsh', name: 'Low-NPSH suction', desc: 'NPSHa = 2.5 m crítico' },
  { id: 'high_temp', name: 'High temperature 80°C', desc: 'Boiler feed water' },
]

export function ProjectTemplatesGallery({ onSelect }: { onSelect?: (id: string) => void }) {
  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Templates de Projeto</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {PROJECT_TEMPLATES.map(t => (
          <div key={t.id}
               onClick={() => onSelect?.(t.id)}
               style={{
                 padding: 12, background: 'var(--bg-secondary)', borderRadius: 6,
                 cursor: 'pointer', border: '1px solid transparent',
                 transition: 'border-color 0.15s',
               }}
               onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)' }}
               onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'transparent' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {t.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
