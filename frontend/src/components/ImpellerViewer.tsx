import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei'
import * as THREE from 'three'
import t from '../i18n/pt-br'
import type { SizingResult } from '../App'

interface BladePoint { x: number; y: number; z: number }
interface BladeSurface {
  ps: BladePoint[][]
  ss: BladePoint[][]
  ps_pressure?: number[][]
  ss_pressure?: number[][]
}
interface ImpellerData {
  blade_surfaces: BladeSurface[]
  splitter_surfaces?: BladeSurface[]
  splitter_count?: number
  splitter_start_fraction?: number
  hub_profile: BladePoint[]
  shroud_profile: BladePoint[]
  hub_disc?: BladePoint[]       // optional back-plate ring
  blade_count: number
  d2: number
  d1?: number
  b2?: number
  actual_wrap_angle?: number
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

// ─── Geometry builders ────────────────────────────────────────────────────────

function buildQuadGeo(grid: BladePoint[][]): THREE.BufferGeometry {
  const nSpan = grid.length
  const nChord = grid[0]?.length ?? 0
  const pos: number[] = []

  for (let s = 0; s < nSpan - 1; s++) {
    for (let c = 0; c < nChord - 1; c++) {
      const p00 = grid[s][c], p10 = grid[s + 1][c]
      const p01 = grid[s][c + 1], p11 = grid[s + 1][c + 1]

      // Two triangles per quad
      pos.push(p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z)
      pos.push(p10.x, p10.y, p10.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function buildQuadGeoWithColors(grid: BladePoint[][], pressureGrid: number[][]): THREE.BufferGeometry {
  const nSpan = grid.length
  const nChord = grid[0]?.length ?? 0
  const pos: number[] = []
  const colors: number[] = []

  const pColor = (p: number): [number, number, number] => {
    const r = Math.max(0, Math.min(1, p < 0.5 ? 0.08 + p * 0.24 : 0.32 + (p - 0.5) * 1.37))
    const g = Math.max(0, Math.min(1, p < 0.3 ? 0.08 + p * 0.39 : p < 0.7 ? 0.2 + p * 0.63 : 0.63 + (p - 0.7) * 1.1))
    const b = Math.max(0, Math.min(1, p < 0.4 ? 0.71 - p * 0.78 : Math.max(0, 0.4 - p * 0.4)))
    return [r, g, b]
  }

  const addTri = (
    p0: BladePoint, p1: BladePoint, p2: BladePoint,
    pr0: number, pr1: number, pr2: number,
  ) => {
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
    const c0 = pColor(pr0), c1 = pColor(pr1), c2 = pColor(pr2)
    colors.push(...c0, ...c1, ...c2)
  }

  for (let s = 0; s < nSpan - 1; s++) {
    for (let c = 0; c < nChord - 1; c++) {
      const p00 = grid[s][c], p10 = grid[s + 1][c]
      const p01 = grid[s][c + 1], p11 = grid[s + 1][c + 1]
      const pr00 = pressureGrid?.[s]?.[c] ?? 0.5
      const pr10 = pressureGrid?.[s + 1]?.[c] ?? 0.5
      const pr01 = pressureGrid?.[s]?.[c + 1] ?? 0.5
      const pr11 = pressureGrid?.[s + 1]?.[c + 1] ?? 0.5
      addTri(p00, p10, p01, pr00, pr10, pr01)
      addTri(p10, p11, p01, pr10, pr11, pr01)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

function buildRevolutionGeo(profile: BladePoint[], segs = 128): THREE.BufferGeometry {
  if (profile.length < 2) return new THREE.BufferGeometry()
  const pos: number[] = []
  for (let i = 0; i < profile.length - 1; i++) {
    const r0 = profile[i].x, z0 = profile[i].z
    const r1 = profile[i + 1].x, z1 = profile[i + 1].z
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2
      const a1 = ((j + 1) / segs) * Math.PI * 2
      pos.push(r0 * Math.cos(a0), r0 * Math.sin(a0), z0,
               r1 * Math.cos(a0), r1 * Math.sin(a0), z1,
               r0 * Math.cos(a1), r0 * Math.sin(a1), z0)
      pos.push(r1 * Math.cos(a0), r1 * Math.sin(a0), z1,
               r1 * Math.cos(a1), r1 * Math.sin(a1), z1,
               r0 * Math.cos(a1), r0 * Math.sin(a1), z0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Hub back-disc: flat annular disc at the outlet z-plane */
function buildHubDiscGeo(hubProfile: BladePoint[], segs = 128): THREE.BufferGeometry {
  if (hubProfile.length < 2) return new THREE.BufferGeometry()
  // The hub profile goes from inlet (small r, large z) to outlet (large r, z~0)
  // Build a flat disc at the outlet end (last point) — from shaft radius to r2
  const outlet = hubProfile[hubProfile.length - 1]
  const shaft = hubProfile[0]
  const z = outlet.z
  const r_outer = outlet.x
  const r_inner = shaft.x * 0.4  // shaft radius estimate

  const pos: number[] = []
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * Math.PI * 2
    const a1 = ((j + 1) / segs) * Math.PI * 2
    // Annular triangle pair
    pos.push(r_inner * Math.cos(a0), r_inner * Math.sin(a0), z,
             r_outer * Math.cos(a0), r_outer * Math.sin(a0), z,
             r_inner * Math.cos(a1), r_inner * Math.sin(a1), z)
    pos.push(r_outer * Math.cos(a0), r_outer * Math.sin(a0), z,
             r_outer * Math.cos(a1), r_outer * Math.sin(a1), z,
             r_inner * Math.cos(a1), r_inner * Math.sin(a1), z)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

// ─── Pressure colormap helper (used in legend) ────────────────────────────────

function pressureColor(p: number): string {
  // Viridis-inspired: low=dark blue, mid=teal/green, high=yellow
  const r = Math.round(Math.max(0, Math.min(255, p < 0.5 ? 20 + p * 60 : 80 + (p - 0.5) * 350)))
  const g = Math.round(Math.max(0, Math.min(255, p < 0.3 ? 20 + p * 100 : p < 0.7 ? 50 + p * 160 : 160 + (p - 0.7) * 280)))
  const b = Math.round(Math.max(0, Math.min(255, p < 0.4 ? 180 - p * 200 : Math.max(0, 100 - p * 100))))
  return `rgb(${r},${g},${b})`
}

// suppress unused warning — pressureColor is exported as utility; keep for reference
void pressureColor

// ─── Materials ────────────────────────────────────────────────────────────────

const PS_COLOR = '#1e90ff'      // pressure side — vivid blue
const SS_COLOR = '#c026d3'      // suction side — fuchsia/magenta
const HUB_COLOR = '#374151'     // hub — dark steel
const SHROUD_COLOR = '#1f2937'
const SPLITTER_COLOR = '#06b6d4' // splitter PS — teal/cyan

// ─── ClipController ───────────────────────────────────────────────────────────

function ClipController({ clipZ }: { clipZ: number | null }) {
  const { gl } = useThree()
  useEffect(() => {
    if (clipZ === null) {
      gl.clippingPlanes = []
      gl.localClippingEnabled = false
    } else {
      gl.localClippingEnabled = true
      gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), clipZ)]
    }
    return () => {
      gl.clippingPlanes = []
      gl.localClippingEnabled = false
    }
  }, [clipZ, gl])
  return null
}

// ─── Scene components ─────────────────────────────────────────────────────────

function BladeSurfaceMesh({ surface, idx, showColormap }: { surface: BladeSurface; idx: number; showColormap: boolean }) {
  const psGeo = useMemo(
    () => showColormap && surface.ps_pressure
      ? buildQuadGeoWithColors(surface.ps, surface.ps_pressure)
      : buildQuadGeo(surface.ps),
    [surface, showColormap],
  )
  const ssGeo = useMemo(
    () => showColormap && surface.ss_pressure
      ? buildQuadGeoWithColors(surface.ss, surface.ss_pressure)
      : buildQuadGeo(surface.ss),
    [surface, showColormap],
  )
  return (
    <>
      <mesh geometry={psGeo} castShadow>
        <meshStandardMaterial
          vertexColors={showColormap}
          color={showColormap ? '#ffffff' : PS_COLOR}
          side={THREE.DoubleSide}
          metalness={0.55}
          roughness={0.28}
        />
      </mesh>
      <mesh geometry={ssGeo} castShadow>
        <meshStandardMaterial
          vertexColors={showColormap}
          color={showColormap ? '#ffffff' : SS_COLOR}
          side={THREE.DoubleSide}
          metalness={0.55}
          roughness={0.28}
        />
      </mesh>
    </>
  )
}

function SplitterSurfaceMesh({ surface, showColormap }: { surface: BladeSurface; showColormap: boolean }) {
  const psGeo = useMemo(
    () => showColormap && surface.ps_pressure
      ? buildQuadGeoWithColors(surface.ps, surface.ps_pressure)
      : buildQuadGeo(surface.ps),
    [surface, showColormap],
  )
  const ssGeo = useMemo(
    () => showColormap && surface.ss_pressure
      ? buildQuadGeoWithColors(surface.ss, surface.ss_pressure)
      : buildQuadGeo(surface.ss),
    [surface, showColormap],
  )
  return (
    <>
      <mesh geometry={psGeo} castShadow>
        <meshStandardMaterial
          vertexColors={showColormap}
          color={showColormap ? '#ffffff' : SPLITTER_COLOR}
          side={THREE.DoubleSide}
          metalness={0.50}
          roughness={0.32}
        />
      </mesh>
      <mesh geometry={ssGeo} castShadow>
        <meshStandardMaterial
          vertexColors={showColormap}
          color={showColormap ? '#ffffff' : '#0891b2'}
          side={THREE.DoubleSide}
          metalness={0.50}
          roughness={0.32}
        />
      </mesh>
    </>
  )
}

function HubMesh({ profile }: { profile: BladePoint[] }) {
  const geo = useMemo(() => buildRevolutionGeo(profile, 96), [profile])
  const discGeo = useMemo(() => buildHubDiscGeo(profile, 96), [profile])
  return (
    <>
      <mesh geometry={geo} receiveShadow castShadow>
        <meshStandardMaterial color={HUB_COLOR} metalness={0.75} roughness={0.30} />
      </mesh>
      <mesh geometry={discGeo} receiveShadow castShadow>
        <meshStandardMaterial color={HUB_COLOR} metalness={0.75} roughness={0.30} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

function ShroudMesh({ profile }: { profile: BladePoint[] }) {
  const geo = useMemo(() => buildRevolutionGeo(profile, 96), [profile])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={SHROUD_COLOR} metalness={0.5} roughness={0.5} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function RotatingGroup({ children, paused, rpm }: { children: React.ReactNode; paused?: boolean; rpm?: number }) {
  const ref = useRef<THREE.Group>(null)
  // Rotation speed: simulate ~1/10 of real RPM for visual effect
  const speed = rpm ? (rpm / 60) * Math.PI * 2 * 0.04 : 0.5
  useFrame((_, d) => { if (ref.current && !paused) ref.current.rotation.z += d * speed })
  return <group ref={ref}>{children}</group>
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      {/* Key light — top front */}
      <directionalLight position={[3, 5, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      {/* Fill light — left */}
      <directionalLight position={[-4, 2, 2]} intensity={0.6} color="#b0d4ff" />
      {/* Rim light — back right */}
      <directionalLight position={[2, -3, -3]} intensity={0.45} color="#ffccff" />
      {/* Under fill */}
      <directionalLight position={[0, -4, 2]} intensity={0.2} color="#ffffff" />
      {/* Point at center for blade edge highlights */}
      <pointLight position={[0, 0, 2]} intensity={0.8} distance={8} color="#ffffff" />
    </>
  )
}

// ─── Particle system ──────────────────────────────────────────────────────────

const N_PARTICLES = 120
const N_LANES = 6  // spanwise lanes

interface Particle {
  laneR: number       // radial lane fraction 0=hub 1=shroud
  phase: number       // 0-1 phase offset along path
  speed: number       // relative speed multiplier
  bladeOffset: number // which blade passage (0 to bladeCount-1)
}

function ParticleSystem({
  data,
  active,
  paused,
}: {
  data: ImpellerData
  active: boolean
  paused?: boolean
}) {
  const pointsRef = useRef<THREE.Points>(null)

  // Pre-compute particle descriptors once
  const particles = useMemo<Particle[]>(() => {
    const arr: Particle[] = []
    const bc = data.blade_count || 5
    for (let i = 0; i < N_PARTICLES; i++) {
      arr.push({
        laneR: ((i % N_LANES) + 0.5) / N_LANES,
        phase: i / N_PARTICLES,
        speed: 0.6 + (i % 7) * 0.07,
        bladeOffset: i % bc,
      })
    }
    return arr
  }, [data.blade_count])

  // Build geometry and color attribute
  const { geo, posAttr, colorAttr } = useMemo(() => {
    const pos = new Float32Array(N_PARTICLES * 3)
    const col = new Float32Array(N_PARTICLES * 3)
    const geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(pos, 3)
    const colorAttr = new THREE.BufferAttribute(col, 3)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colorAttr)
    return { geo, posAttr, colorAttr }
  }, [])

  // Normalisation scale — same as Scene uses
  const scale = useMemo(() => {
    const r2_mm = (data.d2 * 500) || 1
    return 1.8 / r2_mm
  }, [data.d2])

  // Get meridional path point: fraction t ∈ [0,1], spanR ∈ [0,1]
  const getPoint = (t: number, spanR: number, thetaOffset: number): [number, number, number] => {
    const hub = data.hub_profile
    const shr = data.shroud_profile
    if (!hub.length || !shr.length) return [0, 0, 0]

    const idx = Math.min(Math.floor(t * (hub.length - 1)), hub.length - 2)
    const frac = t * (hub.length - 1) - idx

    const hx = (hub[idx].x + frac * (hub[idx + 1].x - hub[idx].x)) * scale
    const hz = (hub[idx].z + frac * (hub[idx + 1].z - hub[idx].z)) * scale
    const sx = (shr[idx].x + frac * (shr[idx + 1].x - shr[idx].x)) * scale
    const sz = (shr[idx].z + frac * (shr[idx + 1].z - shr[idx].z)) * scale

    const r = hx + spanR * (sx - hx)
    const z = hz + spanR * (sz - hz)

    // Add swirl: theta increases from 0 at inlet to ~wrap_angle at outlet
    const swirl = t * (data.actual_wrap_angle ?? 90) * Math.PI / 180
    const theta = thetaOffset + swirl

    return [r * Math.cos(theta), r * Math.sin(theta), z]
  }

  const clockRef = useRef(0)

  useFrame((_, delta) => {
    if (!active || paused || !pointsRef.current) return
    clockRef.current += delta

    const bc = data.blade_count || 5
    const pitchAngle = (Math.PI * 2) / bc

    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i]
      // Animate phase 0→1
      const t = (p.phase + clockRef.current * p.speed * 0.18) % 1.0
      const thetaBase = p.bladeOffset * pitchAngle + pitchAngle * 0.5
      const [x, y, z] = getPoint(t, p.laneR, thetaBase)

      posAttr.setXYZ(i, x, y, z)

      // Color: blue at inlet → cyan → white at outlet
      const fade = Math.sin(t * Math.PI)  // fade in/out
      const r = 0.1 + t * 0.8
      const g = 0.5 + t * 0.4
      const b = 1.0 - t * 0.3
      colorAttr.setXYZ(i, r * fade, g * fade, b * fade)
    }

    posAttr.needsUpdate = true
    colorAttr.needsUpdate = true
  })

  if (!active) return null

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        vertexColors
        size={3.5}
        sizeAttenuation={false}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
  data, paused, rpm, showSplitters, clipZ, showColormap, showParticles,
}: {
  data: ImpellerData
  paused?: boolean
  rpm?: number
  showSplitters?: boolean
  clipZ: number | null
  showColormap: boolean
  showParticles: boolean
}) {
  // Normalize scale to fit in a ~2-unit radius
  const r2_mm = (data.d2 * 500) || 1   // d2 in m → r2 in mm → scale factor
  const scale = 1.8 / r2_mm

  return (
    <>
      <PerspectiveCamera makeDefault position={[1.8, 1.4, 1.2]} fov={45} />
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={0.5} maxDistance={8} />
      <SceneLights />
      <ClipController clipZ={clipZ} />

      <RotatingGroup paused={paused} rpm={rpm}>
        <group scale={[scale, scale, scale]}>
          <HubMesh profile={data.hub_profile} />
          <ShroudMesh profile={data.shroud_profile} />
          {data.blade_surfaces.map((surf, i) => (
            <BladeSurfaceMesh key={i} surface={surf} idx={i} showColormap={showColormap} />
          ))}
          {showSplitters && data.splitter_surfaces?.map((surf, i) => (
            <SplitterSurfaceMesh key={`spl_${i}`} surface={surf} showColormap={showColormap} />
          ))}
        </group>
      </RotatingGroup>

      <ParticleSystem data={data} active={showParticles} paused={paused} />

      {/* Floor grid */}
      <gridHelper args={[6, 24, '#1a2a3a', '#141e27']} position={[0, 0, -2.2]} rotation={[Math.PI / 2, 0, 0]} />
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImpellerViewer({
  flowRate, head, rpm,
  fullscreen, loading: parentLoading, sizing, onRunSizing,
}: Props) {
  const [data, setData] = useState<ImpellerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [showSplitters, setShowSplitters] = useState(false)
  const [clipZ, setClipZ] = useState<number | null>(null)
  const [showColormap, setShowColormap] = useState(false)
  const [showParticles, setShowParticles] = useState(false)

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
      body: JSON.stringify({
        flow_rate: flowRate / 3600,
        head,
        rpm,
        n_blade_points: 60,   // increased from 40
        n_span_points: 16,    // increased from 8
        add_splitters: showSplitters,
        splitter_start: 0.4,
      }),
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [flowRate, head, rpm, showSplitters])

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

  const isLoading = loading || parentLoading

  const canvasEl = isLoading ? (
    <LoadingOverlay />
  ) : error ? (
    <ErrorOverlay msg={`${t.failed3d}: ${error}`} />
  ) : data ? (
    <Canvas shadows style={{ width: '100%', height: '100%', background: '#090d12' }}>
      <Scene data={data} paused={paused} rpm={rpm} showSplitters={showSplitters} clipZ={clipZ} showColormap={showColormap} showParticles={showParticles} />
    </Canvas>
  ) : (
    <CenteredMsg text={t.enterOperatingPoint} />
  )

  if (!fullscreen) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: 0 }}>{t.impeller3d}</h3>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-muted)', alignItems: 'center' }}>
            {data && <span>{data.blade_count} pás · D2 {(data.d2 * 1000).toFixed(0)} mm</span>}
            {data?.actual_wrap_angle && <span>Wrap {data.actual_wrap_angle.toFixed(0)}°</span>}
          </div>
        </div>
        {/* Legend / colormap legend */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
          {!showColormap && (
            <>
              <LegendItem color={PS_COLOR} label="LP (pressão)" />
              <LegendItem color={SS_COLOR} label="LS (sucção)" />
              <LegendItem color={HUB_COLOR} label="Cubo / Disco" />
            </>
          )}
          {showColormap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Baixa P</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #1040b0, #00a0a0, #40c040, #e0c000, #e04000)' }} />
              <span>Alta P</span>
            </div>
          )}
        </div>
        <div style={{ height: 440, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)', background: '#090d12' }}>
          {canvasEl}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{t.dragToRotate}</span>
          <ControlButton label={paused ? '▶' : '⏸'} onClick={() => setPaused(p => !p)} />
          <ControlButton label={showColormap ? 'Mapa P ON' : 'Mapa P'} onClick={() => setShowColormap(c => !c)} />
          <ControlButton label={showParticles ? '◉ Fluxo' : '○ Fluxo'} onClick={() => setShowParticles(p => !p)} />
          <button
            onClick={() => setClipZ(c => c === null ? 0 : null)}
            style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 4,
              border: `1px solid ${clipZ !== null ? 'var(--accent)' : 'var(--border-primary)'}`,
              background: clipZ !== null ? 'rgba(0,160,223,0.15)' : 'transparent',
              color: clipZ !== null ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {clipZ !== null ? 'Corte ON' : 'Corte'}
          </button>
          {['STEP', 'STL'].map(fmt => (
            <button key={fmt} onClick={() => handleExport(fmt.toLowerCase())}
              className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>{fmt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── FULLSCREEN MODE ──────────────────────────────────────────────────────────
  return (
    <div className="viewer-fullscreen">
      <div style={{ width: '100%', height: '100%', background: '#090d12' }}>
        {canvasEl}
      </div>

      {/* TOP-LEFT: Legend bar */}
      <div className="viewer-overlay viewer-overlay-tl">
        <div className="glass-panel" style={{ padding: '7px 14px', display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>HPE</span>
          {!showColormap && (
            <>
              <LegendItem color={PS_COLOR} label="LP" />
              <LegendItem color={SS_COLOR} label="LS" />
              <LegendItem color={HUB_COLOR} label="Hub" />
            </>
          )}
          {showColormap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Baixa P</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #1040b0, #00a0a0, #40c040, #e0c000, #e04000)' }} />
              <span>Alta P</span>
            </div>
          )}
          {data && (
            <>
              <span style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-primary)', paddingLeft: 12 }}>
                {data.blade_count} pás
              </span>
              <span style={{ color: 'var(--text-muted)' }}>D2 {(data.d2 * 1000).toFixed(0)} mm</span>
              {data.actual_wrap_angle != null &&
                <span style={{ color: 'var(--text-muted)' }}>Wrap {data.actual_wrap_angle.toFixed(0)}°</span>}
            </>
          )}
        </div>
      </div>

      {/* LEFT: Operating point panel */}
      <div className="viewer-overlay" style={{ top: 64, left: 16 }}>
        <div className="glass-panel" style={{ padding: 16, width: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>
            {t.operatingPoint}
          </div>
          <form onSubmit={handleFloatingRun}>
            <FloatInput label={t.flowRate} value={fQ} onChange={setFQ} />
            <FloatInput label={t.head} value={fH} onChange={setFH} />
            <FloatInput label={t.speed} value={fN} onChange={setFN} />
            <button type="submit" className="btn-primary" disabled={isLoading}
              style={{ width: '100%', padding: '8px', fontSize: 12, marginTop: 4 }}>
              {isLoading ? t.computing : t.runSizing}
            </button>
          </form>

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
        <div className="glass-panel" style={{ padding: '7px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 520 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.dragToRotate}</span>
          <ControlButton label={paused ? '▶ Girar' : '⏸ Pausar'} onClick={() => setPaused(p => !p)} />
          <ControlButton label={showColormap ? 'Mapa P ON' : 'Mapa P'} onClick={() => setShowColormap(c => !c)} />
          <ControlButton label={showParticles ? '◉ Fluxo' : '○ Fluxo'} onClick={() => setShowParticles(p => !p)} />

          {/* Clip plane slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Corte Z</span>
            <input
              type="range"
              min={-200} max={200} step={5}
              value={clipZ ?? 0}
              onChange={e => setClipZ(clipZ === null ? null : parseFloat(e.target.value))}
              style={{ width: 80, accentColor: 'var(--accent)' }}
            />
            <button
              onClick={() => setClipZ(c => c === null ? 0 : null)}
              style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                border: `1px solid ${clipZ !== null ? 'var(--accent)' : 'var(--border-primary)'}`,
                background: clipZ !== null ? 'rgba(0,160,223,0.15)' : 'transparent',
                color: clipZ !== null ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {clipZ !== null ? 'ON' : 'OFF'}
            </button>
          </div>

          {['STEP', 'STL'].map(fmt => (
            <button key={fmt} onClick={() => handleExport(fmt.toLowerCase())}
              className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>{fmt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function ControlButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: '1px solid var(--border-primary)',
      borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
      padding: '3px 9px', fontSize: 11,
    }}>{label}</button>
  )
}

function CenteredMsg({ text, color = 'var(--text-muted)' }: { text: string; color?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 14 }}>
      {text}
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"
        style={{ animation: 'spin 1s linear infinite' }}>
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
      <span style={{ fontSize: 13 }}>{t.loading3d}</span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ErrorOverlay({ msg }: { msg: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-danger)', fontSize: 13, padding: 20, textAlign: 'center' }}>
      {msg}
    </div>
  )
}

function FloatInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</span>
      <input className="input" type="number" step="any" value={value}
        onChange={e => onChange(e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} />
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
