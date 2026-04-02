import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import t from '../i18n/pt-br'
import type { SizingResult } from '../App'

interface BladePoint { x: number; y: number; z: number }
interface BladeSurface { ps: BladePoint[][]; ss: BladePoint[][] }
interface ImpellerData {
  blade_surfaces: BladeSurface[]
  hub_profile: BladePoint[]
  shroud_profile: BladePoint[]
  blade_count: number
  d2: number
}

interface Props {
  flowRate: number
  head: number
  rpm: number
  fullscreen?: boolean
  loading?: boolean
  sizing?: SizingResult | null
  onRunSizing?: (q: number, h: number, n: number) => void
}

function buildQuadGeo(grid: BladePoint[][]): THREE.BufferGeometry {
  const nSpan = grid.length
  const nChord = grid[0]?.length ?? 0
  const pos: number[] = []
  for (let s = 0; s < nSpan - 1; s++) {
    for (let c = 0; c < nChord - 1; c++) {
      const p00 = grid[s][c], p10 = grid[s+1][c]
      const p01 = grid[s][c+1], p11 = grid[s+1][c+1]
      pos.push(p00.x,p00.y,p00.z, p10.x,p10.y,p10.z, p01.x,p01.y,p01.z)
      pos.push(p10.x,p10.y,p10.z, p11.x,p11.y,p11.z, p01.x,p01.y,p01.z)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function BladeSurfaceMesh({ surface }: { surface: BladeSurface }) {
  const psGeo = useMemo(() => buildQuadGeo(surface.ps), [surface])
  const ssGeo = useMemo(() => buildQuadGeo(surface.ss), [surface])
  return (
    <>
      <mesh geometry={psGeo}>
        <meshStandardMaterial color="#00A0DF" side={THREE.DoubleSide} metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh geometry={ssGeo}>
        <meshStandardMaterial color="#7B1FA2" side={THREE.DoubleSide} metalness={0.35} roughness={0.45} />
      </mesh>
    </>
  )
}

function RevolutionSurface({ profile, color, opacity = 1 }: { profile: BladePoint[]; color: string; opacity?: number }) {
  const geo = useMemo(() => {
    if (profile.length < 2) return new THREE.BufferGeometry()
    const segs = 64
    const pos: number[] = []
    for (let i = 0; i < profile.length - 1; i++) {
      const r0 = profile[i].x, z0 = profile[i].z
      const r1 = profile[i+1].x, z1 = profile[i+1].z
      for (let j = 0; j < segs; j++) {
        const a0 = (j / segs) * Math.PI * 2, a1 = ((j+1) / segs) * Math.PI * 2
        pos.push(r0*Math.cos(a0),r0*Math.sin(a0),z0, r1*Math.cos(a0),r1*Math.sin(a0),z1, r0*Math.cos(a1),r0*Math.sin(a1),z0)
        pos.push(r1*Math.cos(a0),r1*Math.sin(a0),z1, r1*Math.cos(a1),r1*Math.sin(a1),z1, r0*Math.cos(a1),r0*Math.sin(a1),z0)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [profile])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={0.6} roughness={0.3} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
}

function RotatingGroup({ children, paused }: { children: React.ReactNode; paused?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, d) => { if (ref.current && !paused) ref.current.rotation.z += d * 0.5 })
  return <group ref={ref}>{children}</group>
}

function Scene({ data, paused }: { data: ImpellerData; paused?: boolean }) {
  const scale = 1.0 / Math.max(data.d2 * 500, 1)
  return (
    <>
      <PerspectiveCamera makeDefault position={[2, 2, 1.5]} />
      <OrbitControls enableDamping dampingFactor={0.1} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 5, 5]} intensity={0.9} />
      <directionalLight position={[-3, -1, 2]} intensity={0.35} />
      <directionalLight position={[0, -5, 3]} intensity={0.2} />
      <RotatingGroup paused={paused}>
        <group scale={[scale, scale, scale]}>
          <RevolutionSurface profile={data.hub_profile} color="#4a4a4a" />
          <RevolutionSurface profile={data.shroud_profile} color="#2a2a2a" opacity={0.35} />
          {data.blade_surfaces.map((surf, i) => <BladeSurfaceMesh key={i} surface={surf} />)}
        </group>
      </RotatingGroup>
      <gridHelper args={[4, 20, '#222', '#1a1a1a']} rotation={[Math.PI/2, 0, 0]} position={[0, 0, -0.5]} />
    </>
  )
}

export default function ImpellerViewer({ flowRate, head, rpm, fullscreen, loading: parentLoading, sizing, onRunSizing }: Props) {
  const [data, setData] = useState<ImpellerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)

  // Floating form state
  const [fQ, setFQ] = useState(String(flowRate))
  const [fH, setFH] = useState(String(head))
  const [fN, setFN] = useState(String(rpm))

  useEffect(() => { setFQ(String(flowRate)); setFH(String(head)); setFN(String(rpm)) }, [flowRate, head, rpm])

  useEffect(() => {
    if (flowRate <= 0 || head <= 0 || rpm <= 0) return
    setLoading(true); setError(null)
    fetch('/api/v1/geometry/impeller', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_rate: flowRate / 3600, head, rpm, n_blade_points: 40, n_span_points: 8 }),
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [flowRate, head, rpm])

  const handleExport = async (format: string) => {
    try {
      const res = await fetch('/api/v1/geometry/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_rate: flowRate / 3600, head, rpm, format }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || `Erro ${res.status}`); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `rotor.${format}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(`Falha: ${e.message}`) }
  }

  const handleFloatingRun = (e: React.FormEvent) => {
    e.preventDefault()
    const q = parseFloat(fQ), h = parseFloat(fH), n = parseFloat(fN)
    if (q > 0 && h > 0 && n > 0 && onRunSizing) onRunSizing(q, h, n)
  }

  const canvasHeight = fullscreen ? '100%' : 420
  const isLoading = loading || parentLoading

  if (!fullscreen) {
    // Compact mode (legacy)
    return (
      <div>
        <h3 style={{ color: 'var(--accent)', fontSize: 15, marginBottom: 8 }}>{t.impeller3d}</h3>
        <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <LegendItem color="#00A0DF" label="Lado pressão (LP)" />
          <LegendItem color="#7B1FA2" label="Lado sucção (LS)" />
          <LegendItem color="#4a4a4a" label="Hub / Coroa" />
        </div>
        <div style={{ height: 420, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)', background: '#080808' }}>
          {isLoading ? <CenteredMsg text={t.loading3d} /> :
           error ? <CenteredMsg text={`${t.failed3d}: ${error}`} color="var(--accent-danger)" /> :
           !data ? <CenteredMsg text={t.noGeometry} /> :
           <Canvas><Scene data={data} /></Canvas>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          {data && <><span>{data.blade_count} pás</span><span>D2: {(data.d2 * 1000).toFixed(0)} mm</span></>}
          <span>{t.dragToRotate}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {['STEP','STL'].map(fmt => (
              <button key={fmt} onClick={() => handleExport(fmt.toLowerCase())} className="btn-primary" style={{ padding: '4px 12px', fontSize: 11 }}>{fmt}</button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ===== FULLSCREEN MODE =====
  return (
    <div className="viewer-fullscreen">
      {/* 3D Canvas — full area */}
      {isLoading ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {t.loading3d}
        </div>
      ) : error ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-danger)', fontSize: 14 }}>
          {t.failed3d}: {error}
        </div>
      ) : data ? (
        <Canvas style={{ width: '100%', height: '100%' }}>
          <Scene data={data} paused={paused} />
        </Canvas>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {t.enterOperatingPoint}
        </div>
      )}

      {/* TOP-LEFT: Legend */}
      <div className="viewer-overlay viewer-overlay-tl">
        <div className="glass-panel" style={{ padding: '8px 14px', display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: 4 }}>HPE</span>
          <LegendItem color="#00A0DF" label="LP" />
          <LegendItem color="#7B1FA2" label="LS" />
          <LegendItem color="#4a4a4a" label="Hub" />
          {data && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{data.blade_count} pás · D2 {(data.d2 * 1000).toFixed(0)} mm</span>}
        </div>
      </div>

      {/* LEFT: Operating point form */}
      <div className="viewer-overlay" style={{ top: 64, left: 16 }}>
        <div className="glass-panel" style={{ padding: 16, width: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>{t.operatingPoint}</div>
          <form onSubmit={handleFloatingRun}>
            <FloatInput label={t.flowRate} value={fQ} onChange={setFQ} />
            <FloatInput label={t.head} value={fH} onChange={setFH} />
            <FloatInput label={t.speed} value={fN} onChange={setFN} />
            <button type="submit" className="btn-primary" disabled={isLoading} style={{ width: '100%', padding: '8px', fontSize: 12, marginTop: 4 }}>
              {isLoading ? t.computing : t.runSizing}
            </button>
          </form>

          {/* Key results */}
          {sizing && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <MetaRow label="Nq" value={sizing.specific_speed_nq.toFixed(1)} />
              <MetaRow label="η total" value={`${(sizing.estimated_efficiency * 100).toFixed(1)}%`} />
              <MetaRow label="NPSHr" value={`${sizing.estimated_npsh_r.toFixed(1)} m`} />
              <MetaRow label="Potência" value={`${(sizing.estimated_power / 1000).toFixed(1)} kW`} />
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM-RIGHT: Controls */}
      <div className="viewer-overlay viewer-overlay-br">
        <div className="glass-panel" style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.dragToRotate}</span>
          <button
            onClick={() => setPaused(p => !p)}
            style={{ background: 'none', border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)', padding: '3px 8px', fontSize: 11 }}
          >
            {paused ? '▶ Girar' : '⏸ Pausar'}
          </button>
          {['STEP','STL'].map(fmt => (
            <button key={fmt} onClick={() => handleExport(fmt.toLowerCase())} className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>
              {fmt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  )
}

function CenteredMsg({ text, color = 'var(--text-muted)' }: { text: string; color?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 14 }}>
      {text}
    </div>
  )
}

function FloatInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</span>
      <input
        className="input"
        type="number"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ padding: '5px 8px', fontSize: 12 }}
      />
    </label>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
