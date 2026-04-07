import React, { useEffect, useState, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface BladePoint { x: number; y: number; z: number }
interface BladeSurface { ps: BladePoint[][]; ss: BladePoint[][] }
interface ImpellerData {
  blade_surfaces: BladeSurface[]
  hub_profile: BladePoint[]
  shroud_profile: BladePoint[]
  blade_count: number
  d2: number
  b2?: number
  d1?: number
}

interface Props {
  flowRate: number  // m³/h
  head: number
  rpm: number
  onExpand: () => void
}

/* ── Geometry helpers (identical convention to ImpellerViewer) ──────────────── */
/** Profile points: p.x = radius [mm], p.z = axial [mm]. Revolution around Z. */
function buildRevolutionGeo(profile: BladePoint[], segs = 72): THREE.BufferGeometry {
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
  const merged = mergeVertices(g, 0.001)
  merged.computeVertexNormals()
  return merged
}

function buildHubDiscGeo(hubProfile: BladePoint[], segs = 72): THREE.BufferGeometry {
  if (hubProfile.length < 2) return new THREE.BufferGeometry()
  let r_outer = 0, z_disc = 0
  for (const p of hubProfile) {
    if (p.x > r_outer) { r_outer = p.x; z_disc = p.z }
  }
  const r_inner = r_outer * 0.18
  const pos: number[] = []
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * Math.PI * 2
    const a1 = ((j + 1) / segs) * Math.PI * 2
    pos.push(r_inner * Math.cos(a0), r_inner * Math.sin(a0), z_disc,
             r_outer * Math.cos(a0), r_outer * Math.sin(a0), z_disc,
             r_inner * Math.cos(a1), r_inner * Math.sin(a1), z_disc)
    pos.push(r_outer * Math.cos(a0), r_outer * Math.sin(a0), z_disc,
             r_outer * Math.cos(a1), r_outer * Math.sin(a1), z_disc,
             r_inner * Math.cos(a1), r_inner * Math.sin(a1), z_disc)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function buildQuadGeo(grid: BladePoint[][]): THREE.BufferGeometry {
  const nSpan = grid.length
  const nChord = grid[0]?.length ?? 0
  const pos: number[] = []
  for (let s = 0; s < nSpan - 1; s++) {
    for (let c = 0; c < nChord - 1; c++) {
      const p00 = grid[s][c], p10 = grid[s + 1][c]
      const p01 = grid[s][c + 1], p11 = grid[s + 1][c + 1]
      pos.push(p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z)
      pos.push(p10.x, p10.y, p10.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  const merged = mergeVertices(g, 0.001)
  merged.computeVertexNormals()
  return merged
}

/* ── Static impeller scene ──────────────────────────────────────────────────── */
function ImpellerScene({ data }: { data: ImpellerData }) {
  // Same normalisation as ImpellerViewer: r2 in mm → scale to ~1.8 world units
  const scale = 1.8 / ((data.d2 * 500) || 1)

  const hubGeo    = useMemo(() => buildRevolutionGeo(data.hub_profile, 72),    [data.hub_profile])
  const hubDiscGeo = useMemo(() => buildHubDiscGeo(data.hub_profile, 72),      [data.hub_profile])
  const shroudGeo = useMemo(() => buildRevolutionGeo(data.shroud_profile, 72), [data.shroud_profile])

  const hubMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#808898', metalness: 0.15, roughness: 0.65, side: THREE.DoubleSide,
  }), [])
  const shroudMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#5a7090', metalness: 0.1, roughness: 0.7,
    transparent: true, opacity: 0.28, side: THREE.DoubleSide,
  }), [])
  const bladeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#00a0df', metalness: 0.55, roughness: 0.3, side: THREE.DoubleSide,
  }), [])

  return (
    <group scale={[scale, scale, scale]}>
      {/* Hub body */}
      <mesh geometry={hubGeo} material={hubMat} receiveShadow castShadow />
      {/* Hub back disc */}
      <mesh geometry={hubDiscGeo} material={hubMat} receiveShadow castShadow />
      {/* Shroud — semi-transparent so blades are visible */}
      <mesh geometry={shroudGeo} material={shroudMat} />
      {/* Blades */}
      {data.blade_surfaces.map((blade, i) => (
        <group key={i}>
          <mesh geometry={buildQuadGeo(blade.ps)} material={bladeMat} castShadow />
          <mesh geometry={buildQuadGeo(blade.ss)} material={bladeMat} castShadow />
        </group>
      ))}
    </group>
  )
}

/* ── Main export ────────────────────────────────────────────────────────────── */
export default function ImpellerMiniPreview({ flowRate, head, rpm, onExpand }: Props) {
  const [data, setData] = useState<ImpellerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!flowRate || !head || !rpm) return
    let cancelled = false
    setLoading(true); setError(false); setData(null)
    fetch('/api/v1/geometry/impeller', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_rate: flowRate / 3600, head, rpm, resolution_preset: 'low' }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [flowRate, head, rpm])

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: 9, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        transition: 'border-color 0.18s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Preview 3D</span>
        </div>
        {data && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Z={data.blade_count} · D2={(data.d2 * 1000).toFixed(0)}mm
          </span>
        )}
      </div>

      {/* Canvas */}
      <div style={{
        flex: 1, minHeight: 310, position: 'relative',
        background: 'linear-gradient(160deg, #0e1f2e 0%, #060d14 100%)',
      }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: 8,
            color: 'var(--text-muted)', fontSize: 12, zIndex: 2,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Gerando geometria…
          </div>
        )}

        {error && !loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: 'var(--text-muted)', fontSize: 12,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
            <span style={{ opacity: 0.45, fontSize: 11 }}>Preview indisponível</span>
          </div>
        )}

        {data && !loading && (
          <Canvas
            shadows
            gl={{ antialias: true, alpha: true }}
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            dpr={[1, 1.5]}
          >
            {/* Same camera position as ImpellerViewer */}
            <PerspectiveCamera makeDefault position={[2.5, 1.8, 3.5]} fov={34} />
            {/* Subtle orbit drag allowed, no auto-rotate */}
            <OrbitControls
              enableDamping dampingFactor={0.1}
              enableZoom={false}
              enablePan={false}
              autoRotate={false}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2}
            />
            {/* CAD-style lighting (same as ImpellerViewer SceneLights) */}
            <ambientLight intensity={0.85} />
            <directionalLight position={[3, 4, 5]} intensity={1.0} castShadow
              shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
            <directionalLight position={[-3, 2, 4]} intensity={0.8} color="#f4f4f4" />
            <directionalLight position={[0, -3, 2]} intensity={0.4} color="#e8e8e8" />
            <directionalLight position={[0, 0, -4]} intensity={0.5} color="#d0d4dc" />
            <ImpellerScene data={data} />
          </Canvas>
        )}

        {/* Vignette */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(6,13,20,0.55) 100%)',
        }} />

        {/* "Drag to rotate" hint — shows only on hover */}
        {data && hovered && (
          <div style={{
            position: 'absolute', bottom: 8, left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <span style={{
              fontSize: 9, color: 'rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.4)',
              padding: '2px 8px', borderRadius: 8, letterSpacing: '0.04em',
            }}>
              Arrastar para girar
            </span>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <button
        onClick={onExpand}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '9px 14px', cursor: 'pointer', border: 'none',
          background: hovered ? 'rgba(0,160,223,0.10)' : 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          color: hovered ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-family)',
          transition: 'all 0.18s',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        </svg>
        Abrir Geometria 3D completa
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}
