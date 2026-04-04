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
interface BladeLoadingField {
  ps_rvtheta: number[][]
  ss_rvtheta: number[][]
}
interface BladeLoadingData {
  blade_loading: BladeLoadingField[]
  rvtheta_min: number
  rvtheta_max: number
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
  onToast?: (msg: string, type: 'success' | 'error' | 'info') => void
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

/** Diverging colormap: blue (0) → white (0.5) → red (1) for rVθ loading. */
function buildQuadGeoWithDivergingColors(grid: BladePoint[][], valueGrid: number[][]): THREE.BufferGeometry {
  const nSpan = grid.length
  const nChord = grid[0]?.length ?? 0
  const pos: number[] = []
  const colors: number[] = []

  const divColor = (v: number): [number, number, number] => {
    // Blue (0) → White (0.5) → Red (1)
    if (v <= 0.5) {
      const t = v / 0.5
      return [t, t, 1.0]  // blue to white
    } else {
      const t = (v - 0.5) / 0.5
      return [1.0, 1.0 - t, 1.0 - t]  // white to red
    }
  }

  const addTri = (
    p0: BladePoint, p1: BladePoint, p2: BladePoint,
    v0: number, v1: number, v2: number,
  ) => {
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
    const c0 = divColor(v0), c1 = divColor(v1), c2 = divColor(v2)
    colors.push(...c0, ...c1, ...c2)
  }

  for (let s = 0; s < nSpan - 1; s++) {
    for (let c = 0; c < nChord - 1; c++) {
      const p00 = grid[s][c], p10 = grid[s + 1][c]
      const p01 = grid[s][c + 1], p11 = grid[s + 1][c + 1]
      const v00 = valueGrid?.[s]?.[c] ?? 0.5
      const v10 = valueGrid?.[s + 1]?.[c] ?? 0.5
      const v01 = valueGrid?.[s]?.[c + 1] ?? 0.5
      const v11 = valueGrid?.[s + 1]?.[c + 1] ?? 0.5
      addTri(p00, p10, p01, v00, v10, v01)
      addTri(p10, p11, p01, v10, v11, v01)
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
function buildHubDiscGeo(hubProfile: BladePoint[], segs = 96): THREE.BufferGeometry {
  if (hubProfile.length < 2) return new THREE.BufferGeometry()
  // Last point = outlet (r=r2, z~0)
  const outlet = hubProfile[hubProfile.length - 1]
  // First point = shaft (r=r_shaft, z=z_shaft)
  const shaft = hubProfile[0]
  const z = outlet.z
  const r_outer = outlet.x   // in mm already
  const r_inner = Math.min(shaft.x, r_outer * 0.25)

  const pos: number[] = []
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * Math.PI * 2
    const a1 = ((j + 1) / segs) * Math.PI * 2
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

/** Build LE/TE edge caps between PS and SS to make blade look solid */
function buildBladeEdgeCaps(ps: BladePoint[][], ss: BladePoint[][]): THREE.BufferGeometry {
  const nSpan = ps.length
  const nChord = ps[0]?.length ?? 0
  if (nSpan < 2 || nChord < 2) return new THREE.BufferGeometry()
  const pos: number[] = []

  // Leading edge cap (chord index 0): connect PS[:,0] to SS[:,0]
  // Consistent winding: PS0→SS0→PS1, SS0→SS1→PS1 (CCW when viewed from outside)
  for (let s = 0; s < nSpan - 1; s++) {
    const ps0 = ps[s][0], ps1 = ps[s + 1][0]
    const ss0 = ss[s][0], ss1 = ss[s + 1][0]
    pos.push(ps0.x, ps0.y, ps0.z, ss0.x, ss0.y, ss0.z, ps1.x, ps1.y, ps1.z)
    pos.push(ss0.x, ss0.y, ss0.z, ss1.x, ss1.y, ss1.z, ps1.x, ps1.y, ps1.z)
  }

  // Trailing edge cap (chord index nChord-1) — same winding as LE
  const c = nChord - 1
  for (let s = 0; s < nSpan - 1; s++) {
    const ps0 = ps[s][c], ps1 = ps[s + 1][c]
    const ss0 = ss[s][c], ss1 = ss[s + 1][c]
    pos.push(ps0.x, ps0.y, ps0.z, ss0.x, ss0.y, ss0.z, ps1.x, ps1.y, ps1.z)
    pos.push(ss0.x, ss0.y, ss0.z, ss1.x, ss1.y, ss1.z, ps1.x, ps1.y, ps1.z)
  }

  // Fix 3: Restore hub/shroud edge caps (with thinner thickness they work now)
  // Hub edge (span=0): connect PS[0,:] to SS[0,:]
  for (let c2 = 0; c2 < nChord - 1; c2++) {
    const ps0h = ps[0][c2], ps1h = ps[0][c2 + 1]
    const ss0h = ss[0][c2], ss1h = ss[0][c2 + 1]
    pos.push(ps0h.x, ps0h.y, ps0h.z, ss0h.x, ss0h.y, ss0h.z, ps1h.x, ps1h.y, ps1h.z)
    pos.push(ps1h.x, ps1h.y, ps1h.z, ss0h.x, ss0h.y, ss0h.z, ss1h.x, ss1h.y, ss1h.z)
  }
  // Shroud edge (span=nSpan-1)
  const sL = nSpan - 1
  for (let c2 = 0; c2 < nChord - 1; c2++) {
    const ps0s = ps[sL][c2], ps1s = ps[sL][c2 + 1]
    const ss0s = ss[sL][c2], ss1s = ss[sL][c2 + 1]
    pos.push(ps0s.x, ps0s.y, ps0s.z, ps1s.x, ps1s.y, ps1s.z, ss0s.x, ss0s.y, ss0s.z)
    pos.push(ps1s.x, ps1s.y, ps1s.z, ss1s.x, ss1s.y, ss1s.z, ss0s.x, ss0s.y, ss0s.z)
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

// Inventor-style solid matte palette (no shine, no reflections)
const BLADE_COLOR = '#a0a5ad'    // blade PS — matte steel gray
const BLADE_COLOR_ALT = '#8e939b' // blade SS — slightly darker
const HUB_COLOR = '#787e88'       // hub — dark matte
const SPLITTER_COLOR = '#969ba3'  // splitter

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

function BladeSurfaceMesh({
  surface, idx, showColormap, showLoadingMap, loadingField, onSelect, isSelected,
}: {
  surface: BladeSurface
  idx: number
  showColormap: boolean
  showLoadingMap?: boolean
  loadingField?: BladeLoadingField | null
  onSelect: (idx: number) => void
  isSelected: boolean
}) {
  const [hovered, setHovered] = useState(false)

  const psGeo = useMemo(
    () => showLoadingMap && loadingField?.ps_rvtheta
      ? buildQuadGeoWithDivergingColors(surface.ps, loadingField.ps_rvtheta)
      : showColormap && surface.ps_pressure
        ? buildQuadGeoWithColors(surface.ps, surface.ps_pressure)
        : buildQuadGeo(surface.ps),
    [surface, showColormap, showLoadingMap, loadingField],
  )
  const ssGeo = useMemo(
    () => showLoadingMap && loadingField?.ss_rvtheta
      ? buildQuadGeoWithDivergingColors(surface.ss, loadingField.ss_rvtheta)
      : showColormap && surface.ss_pressure
        ? buildQuadGeoWithColors(surface.ss, surface.ss_pressure)
        : buildQuadGeo(surface.ss),
    [surface, showColormap, showLoadingMap, loadingField],
  )

  // Edge caps — close PS-SS gap to make blade look solid
  const capsGeo = useMemo(() => buildBladeEdgeCaps(surface.ps, surface.ss), [surface])

  const useVertexColors = showColormap || showLoadingMap
  const highlight = isSelected || hovered
  const psColor = useVertexColors ? '#ffffff' : (highlight ? '#d0d8e0' : BLADE_COLOR)
  const ssColor = useVertexColors ? '#ffffff' : (highlight ? '#c0c8d0' : BLADE_COLOR_ALT)
  const capColor = useVertexColors ? '#ffffff' : (highlight ? '#bcc4cc' : '#8a929c')
  const emissive = isSelected ? '#1a2530' : hovered ? '#0f1a22' : '#000000'

  return (
    <>
      <mesh geometry={psGeo} castShadow
        onClick={(e) => { e.stopPropagation(); onSelect(idx) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          vertexColors={useVertexColors}
          color={psColor}
          emissive={emissive}
          side={THREE.DoubleSide}
          metalness={0.15}
          roughness={0.75}
        />
      </mesh>
      <mesh geometry={ssGeo} castShadow
        onClick={(e) => { e.stopPropagation(); onSelect(idx) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          vertexColors={useVertexColors}
          color={ssColor}
          emissive={emissive}
          side={THREE.DoubleSide}
          metalness={0.15}
          roughness={0.75}
        />
      </mesh>
      {/* LE/TE edge caps — make blade solid */}
      <mesh geometry={capsGeo} castShadow>
        <meshStandardMaterial
          color={capColor}
          emissive={emissive}
          side={THREE.DoubleSide}
          metalness={0.15}
          roughness={0.70}
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
          metalness={0.15}
          roughness={0.70}
        />
      </mesh>
      <mesh geometry={ssGeo} castShadow>
        <meshStandardMaterial
          vertexColors={showColormap}
          color={showColormap ? '#ffffff' : '#8a929c'}
          side={THREE.DoubleSide}
          metalness={0.15}
          roughness={0.70}
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
        <meshStandardMaterial color={HUB_COLOR} metalness={0.80} roughness={0.20} />
      </mesh>
      <mesh geometry={discGeo} receiveShadow castShadow>
        <meshStandardMaterial color={HUB_COLOR} metalness={0.80} roughness={0.20} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}


/** Shroud surface — solid (closed impeller) or transparent (open impeller) */
function ShroudMesh({ profile, solid }: { profile: BladePoint[]; solid?: boolean }) {
  const geo = useMemo(() => buildRevolutionGeo(profile, 96), [profile])
  // Shroud outer rim — connects shroud shell to hub disc at outlet (z≈0)
  // This closes the gap between shroud and hub at the outer diameter
  const rimGeo = useMemo(() => {
    if (!solid || profile.length < 2) return null
    const outlet = profile[profile.length - 1]
    const r_outer = outlet.x
    const z_shroud = outlet.z
    // Hub outlet is at z≈0, same r_outer — build a connecting strip
    const z_hub = 0
    const segs = 96
    const pos: number[] = []
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2
      const a1 = ((j + 1) / segs) * Math.PI * 2
      // Vertical strip connecting shroud outer edge to hub outer edge
      pos.push(r_outer * Math.cos(a0), r_outer * Math.sin(a0), z_shroud,
               r_outer * Math.cos(a0), r_outer * Math.sin(a0), z_hub,
               r_outer * Math.cos(a1), r_outer * Math.sin(a1), z_shroud)
      pos.push(r_outer * Math.cos(a0), r_outer * Math.sin(a0), z_hub,
               r_outer * Math.cos(a1), r_outer * Math.sin(a1), z_hub,
               r_outer * Math.cos(a1), r_outer * Math.sin(a1), z_shroud)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [profile, solid])

  if (solid) {
    // Closed impeller: just the outer rim ring at D2 (no spherical shroud shell)
    return rimGeo ? (
      <mesh geometry={rimGeo} castShadow receiveShadow>
        <meshStandardMaterial color={HUB_COLOR} metalness={0.80} roughness={0.20} side={THREE.DoubleSide} />
      </mesh>
    ) : null
  }

  // Open impeller — no shroud at all (clean blade view)
  return null
}

function RotatingGroup({ children, paused, rpm }: { children: React.ReactNode; paused?: boolean; rpm?: number }) {
  const ref = useRef<THREE.Group>(null)
  // Rotation speed: simulate ~1/10 of real RPM for visual effect
  const speed = rpm ? (rpm / 60) * Math.PI * 2 * 0.04 : 0.5
  useFrame((_, d) => { if (ref.current && !paused) ref.current.rotation.z += d * speed })
  return <group ref={ref}>{children}</group>
}

function SceneLights() {
  // Inventor/SolidWorks style: high ambient, soft directional, no hard shadows
  return (
    <>
      <ambientLight intensity={0.75} />
      {/* Soft key light — broad, no shadow for matte look */}
      <directionalLight position={[3, 4, 5]} intensity={1.0} color="#ffffff" />
      {/* Fill from opposite — nearly same intensity for even lighting */}
      <directionalLight position={[-3, 2, 4]} intensity={0.8} color="#f4f4f4" />
      {/* Under fill — prevents dark underside */}
      <directionalLight position={[0, -3, 2]} intensity={0.4} color="#e8e8e8" />
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

// ─── Volute geometry builder ──────────────────────────────────────────────────

function buildVoluteGeo(d2Mm: number): THREE.BufferGeometry {
  /**
   * Archimedean spiral volute in the Z=0 plane.
   * r(θ) = r2 + (r_collector - r2) * θ/(2π)   — spiral from tongue to discharge
   * Cross-section: circle of radius growing from 0 at tongue to r_max at 2π
   */
  const r2 = d2Mm / 2           // impeller outlet radius [mm]
  const gap = r2 * 0.06         // radial gap between impeller and tongue
  const r_tongue = r2 + gap     // tongue radius
  const r_collector = r2 * 1.60 // outer scroll radius at 360°
  const b_volute = r2 * 0.55    // axial width of volute (slightly wider than b2)

  const N_THETA = 48            // circumferential divisions
  const N_SECT = 10             // cross-section divisions (tube segments)

  const pos: number[] = []

  for (let i = 0; i < N_THETA; i++) {
    const theta0 = (i / N_THETA) * Math.PI * 2
    const theta1 = ((i + 1) / N_THETA) * Math.PI * 2

    // For each theta station, build a ring cross-section
    const getRing = (theta: number): Array<[number, number, number]> => {
      const frac = theta / (Math.PI * 2)
      const r_center = r_tongue + (r_collector - r_tongue) * frac
      const sect_r = (r_collector - r_tongue) * frac * 0.5 + gap * 0.5
      // Cross-section in the r-z plane around center (r_center, 0)
      const ring: Array<[number, number, number]> = []
      for (let j = 0; j <= N_SECT; j++) {
        const phi = (j / N_SECT) * Math.PI * 2
        const dr = sect_r * Math.cos(phi)
        const dz = sect_r * Math.sin(phi) * (b_volute / (sect_r * 2 + 1e-3))
        const r = r_center + dr
        const x = r * Math.cos(theta)
        const y = r * Math.sin(theta)
        const z = dz
        ring.push([x, y, z])
      }
      return ring
    }

    const ring0 = getRing(theta0)
    const ring1 = getRing(theta1)

    // Connect rings with quads
    for (let j = 0; j < N_SECT; j++) {
      const [x00, y00, z00] = ring0[j]
      const [x01, y01, z01] = ring0[j + 1]
      const [x10, y10, z10] = ring1[j]
      const [x11, y11, z11] = ring1[j + 1]
      pos.push(x00, y00, z00, x10, y10, z10, x01, y01, z01)
      pos.push(x10, y10, z10, x11, y11, z11, x01, y01, z01)
    }
  }

  // Discharge nozzle: a short cylinder tangent to the scroll at 360°
  const r_exit = r_collector
  const nozzle_len = r2 * 0.8
  const nozzle_r = (r_collector - r_tongue) * 0.5
  const N_CIRC = 16
  for (let j = 0; j < N_CIRC; j++) {
    const phi0 = (j / N_CIRC) * Math.PI * 2
    const phi1 = ((j + 1) / N_CIRC) * Math.PI * 2
    // Nozzle along +x direction from (r_exit, 0, 0) for nozzle_len
    const x0 = r_exit + nozzle_r * Math.cos(phi0)
    const z0 = nozzle_r * Math.sin(phi0)
    const x1 = r_exit + nozzle_r * Math.cos(phi1)
    const z1 = nozzle_r * Math.sin(phi1)
    // Along Y (tangential exit)
    pos.push(x0, 0, z0, x0, nozzle_len, z0, x1, 0, z1)
    pos.push(x0, nozzle_len, z0, x1, nozzle_len, z1, x1, 0, z1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return geo
}

function VoluteMesh({ d2Mm }: { d2Mm: number }) {
  const geo = useMemo(() => buildVoluteGeo(d2Mm), [d2Mm])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial
        color="#1e293b"
        metalness={0.4}
        roughness={0.6}
        side={THREE.DoubleSide}
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
  data, paused, rpm, showSplitters, clipZ, showColormap, showLoadingMap, loadingData, showParticles, showVolute, closedImpeller,
  selectedBlade, onSelectBlade,
}: {
  data: ImpellerData
  paused?: boolean
  rpm?: number
  showSplitters?: boolean
  clipZ: number | null
  showColormap: boolean
  showLoadingMap?: boolean
  loadingData?: BladeLoadingData | null
  showParticles: boolean
  showVolute: boolean
  closedImpeller?: boolean
  selectedBlade: number | null
  onSelectBlade: (idx: number) => void
}) {
  // Normalize scale to fit in a ~2-unit radius
  const r2_mm = (data.d2 * 500) || 1   // d2 in m → r2 in mm → scale factor
  const scale = 1.8 / r2_mm

  return (
    <>
      {/* 3/4 elevated — shows blades, hub disc, and eye clearly */}
      <PerspectiveCamera makeDefault position={[2.5, 1.8, 3.5]} fov={34} />
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={1.5} maxDistance={12} target={[0, 0, 0]} />
      <SceneLights />
      {/* No environment map — solid matte look like Inventor/SolidWorks */}
      <ClipController clipZ={clipZ} />

      {/* Fix 6: Light background plane for CAD-style */}
      <mesh position={[0, 0, -3]} rotation={[0, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial color="#1a2030" />
      </mesh>

      <RotatingGroup paused={paused} rpm={rpm}>
        <group scale={[scale, scale, scale]}>
          <HubMesh profile={data.hub_profile} />
          <ShroudMesh profile={data.shroud_profile} solid={closedImpeller} />
          {data.blade_surfaces.map((surf, i) => (
            <BladeSurfaceMesh key={i} surface={surf} idx={i} showColormap={showColormap}
              showLoadingMap={showLoadingMap}
              loadingField={loadingData?.blade_loading?.[i] ?? null}
              onSelect={onSelectBlade} isSelected={selectedBlade === i} />
          ))}
          {showSplitters && data.splitter_surfaces?.map((surf, i) => (
            <SplitterSurfaceMesh key={`spl_${i}`} surface={surf} showColormap={showColormap} />
          ))}
        </group>
      </RotatingGroup>

      {showVolute && (
        <group scale={[scale, scale, scale]}>
          <VoluteMesh d2Mm={data.d2 * 1000} />
        </group>
      )}

      <ParticleSystem data={data} active={showParticles} paused={paused} />

      {/* Floor grid */}
      {/* Fix 6: Light grid for CAD-style background */}
      <gridHelper args={[6, 24, '#2a3545', '#222838']} position={[0, 0, -2.2]} rotation={[Math.PI / 2, 0, 0]} />
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImpellerViewer({
  flowRate, head, rpm,
  fullscreen, loading: parentLoading, sizing, onRunSizing, onToast,
}: Props) {
  const [data, setData] = useState<ImpellerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(true)
  const [showSplitters, setShowSplitters] = useState(false)
  const [closedImpeller, setClosedImpeller] = useState(false)  // open by default — shroud off
  const [clipZ, setClipZ] = useState<number | null>(null)
  const [showColormap, setShowColormap] = useState(false)
  const [showLoadingMap, setShowLoadingMap] = useState(false)
  const [loadingData, setLoadingData] = useState<BladeLoadingData | null>(null)
  const [showParticles, setShowParticles] = useState(false)
  const [showVolute, setShowVolute] = useState(false)
  const [selectedBlade, setSelectedBlade] = useState<number | null>(null)
  const [resolution, setResolution] = useState<string>('high')

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
        resolution_preset: resolution,
        add_splitters: showSplitters,
        splitter_start: 0.4,
      }),
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [flowRate, head, rpm, showSplitters, resolution])

  // Fetch blade loading rVθ data when showLoadingMap is enabled
  useEffect(() => {
    if (!showLoadingMap || flowRate <= 0 || head <= 0 || rpm <= 0) return
    fetch('/api/v1/geometry/blade_loading_field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_rate: flowRate / 3600, head, rpm }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setLoadingData(d) })
      .catch(() => {})
  }, [flowRate, head, rpm, showLoadingMap])

  const notify = (msg: string, type: 'success' | 'error' | 'info') => {
    if (onToast) onToast(msg, type)
    else if (type === 'error') alert(msg)
  }

  const handleExport = async (format: string) => {
    try {
      const res = await fetch('/api/v1/geometry/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_rate: flowRate / 3600, head, rpm, format }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        const detail = e.detail || `Erro ${res.status}`
        if (res.status === 501) {
          notify(`Exportacao ${format.toUpperCase()} indisponivel: ${detail}. Use glTF como alternativa.`, 'error')
        } else {
          notify(`Erro ao exportar ${format.toUpperCase()}: ${detail}`, 'error')
        }
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `rotor.${format}`; a.click()
      URL.revokeObjectURL(url)
      notify(`Exportado rotor.${format} com sucesso`, 'success')
    } catch (e: any) { notify(`Falha ao exportar: ${e.message}`, 'error') }
  }

  const handleGltfExport = async () => {
    try {
      const res = await fetch('/api/v1/geometry/export/gltf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_rate: flowRate / 3600, head, rpm, format: 'gltf' }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        notify(`Erro ao exportar glTF: ${e.detail || `HTTP ${res.status}`}`, 'error')
        return
      }
      const { gltf, filename } = await res.json()
      const blob = new Blob([gltf], { type: 'model/gltf+json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename ?? 'impeller.gltf'; a.click()
      URL.revokeObjectURL(url)
      notify('Exportado glTF com sucesso', 'success')
    } catch (e: any) { notify(`Falha ao exportar glTF: ${e.message}`, 'error') }
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
    <Canvas shadows gl={{ antialias: true, toneMapping: THREE.NoToneMapping }} style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg, #2a3040 0%, #181d28 100%)' }}>
      <Scene data={data} paused={paused} rpm={rpm} showSplitters={showSplitters} clipZ={clipZ} showColormap={showColormap} showLoadingMap={showLoadingMap} loadingData={loadingData} showParticles={showParticles} showVolute={showVolute} closedImpeller={closedImpeller} selectedBlade={selectedBlade} onSelectBlade={setSelectedBlade} />
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
          {!showColormap && !showLoadingMap && (
            <>
              <LegendItem color={BLADE_COLOR} label="Pás" />
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
          {showLoadingMap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Baixo rVθ</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #2060ff, #ffffff, #ff3030)' }} />
              <span>Alto rVθ</span>
            </div>
          )}
        </div>
        <div style={{ height: 440, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'linear-gradient(180deg, #2a3040 0%, #181d28 100%)', position: 'relative' }}>
          {canvasEl}
          {data && selectedBlade !== null && (
            <BladeInfoPanel
              bladeIdx={selectedBlade}
              bladeCount={data.blade_count}
              sizing={sizing}
              onClose={() => setSelectedBlade(null)}
            />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{t.dragToRotate}</span>
          <ControlButton label={paused ? '▶' : '⏸'} onClick={() => setPaused(p => !p)} />
          <ControlButton label={showColormap ? 'Mapa P ON' : 'Mapa P'} onClick={() => { setShowColormap(c => !c); setShowLoadingMap(false) }} />
          <ControlButton label={showLoadingMap ? 'Mapa rVθ ON' : 'Mapa rVθ'} onClick={() => { setShowLoadingMap(l => !l); setShowColormap(false) }} />
          <ControlButton label={showParticles ? '◉ Fluxo' : '○ Fluxo'} onClick={() => setShowParticles(p => !p)} />
          <ControlButton label={closedImpeller ? '◉ Fechado' : '○ Aberto'} onClick={() => setClosedImpeller(v => !v)} />
          <ControlButton label={showVolute ? '◉ Voluta' : '○ Voluta'} onClick={() => setShowVolute(v => !v)} />
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
          <select
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            style={{
              fontSize: 10, padding: '3px 6px', borderRadius: 4,
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="ultra">Ultra</option>
          </select>
          {['STEP', 'STL'].map(fmt => (
            <button key={fmt} onClick={() => handleExport(fmt.toLowerCase())}
              className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>{fmt}
            </button>
          ))}
          <button onClick={handleGltfExport} className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>
            glTF
          </button>
        </div>
      </div>
    )
  }

  // ── FULLSCREEN MODE ──────────────────────────────────────────────────────────
  return (
    <div className="viewer-fullscreen">
      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg, #2a3040 0%, #181d28 100%)' }}>
        {canvasEl}
      </div>

      {data && selectedBlade !== null && (
        <BladeInfoPanel
          bladeIdx={selectedBlade}
          bladeCount={data.blade_count}
          sizing={sizing}
          onClose={() => setSelectedBlade(null)}
        />
      )}

      {/* TOP-LEFT: Legend bar */}
      <div className="viewer-overlay viewer-overlay-tl">
        <div className="glass-panel" style={{ padding: '7px 14px', display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>HPE</span>
          {!showColormap && !showLoadingMap && (
            <>
              <LegendItem color={BLADE_COLOR} label="Pás" />
              <LegendItem color={HUB_COLOR} label="Cubo" />
            </>
          )}
          {showColormap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Baixa P</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #1040b0, #00a0a0, #40c040, #e0c000, #e04000)' }} />
              <span>Alta P</span>
            </div>
          )}
          {showLoadingMap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Baixo rVθ</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #2060ff, #ffffff, #ff3030)' }} />
              <span>Alto rVθ</span>
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
              {selectedBlade === null &&
                <span style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-primary)', paddingLeft: 12 }}>· Clique em uma pá</span>}
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
          <ControlButton label={showColormap ? 'Mapa P ON' : 'Mapa P'} onClick={() => { setShowColormap(c => !c); setShowLoadingMap(false) }} />
          <ControlButton label={showLoadingMap ? 'Mapa rVθ ON' : 'Mapa rVθ'} onClick={() => { setShowLoadingMap(l => !l); setShowColormap(false) }} />
          <ControlButton label={showParticles ? '◉ Fluxo' : '○ Fluxo'} onClick={() => setShowParticles(p => !p)} />
          <ControlButton label={closedImpeller ? '◉ Fechado' : '○ Aberto'} onClick={() => setClosedImpeller(v => !v)} />
          <ControlButton label={showVolute ? '◉ Voluta' : '○ Voluta'} onClick={() => setShowVolute(v => !v)} />

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

          <select
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            style={{
              fontSize: 10, padding: '3px 6px', borderRadius: 4,
              border: '1px solid var(--border-primary)',
              background: 'rgba(10,15,20,0.7)', color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="ultra">Ultra</option>
          </select>
          {['STEP', 'STL'].map(fmt => (
            <button key={fmt} onClick={() => handleExport(fmt.toLowerCase())}
              className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>{fmt}
            </button>
          ))}
          <button onClick={handleGltfExport} className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>
            glTF
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Blade info panel ────────────────────────────────────────────

function BladeInfoPanel({
  bladeIdx,
  bladeCount,
  sizing,
  onClose,
}: {
  bladeIdx: number
  bladeCount: number
  sizing?: SizingResult | null
  onClose: () => void
}) {
  const pitchDeg = 360 / bladeCount
  const bladeDeg = (bladeIdx * pitchDeg).toFixed(1)

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16,
      background: 'rgba(10,15,20,0.92)',
      border: '1px solid rgba(0,160,223,0.4)',
      borderRadius: 8, padding: '12px 16px', minWidth: 180,
      backdropFilter: 'blur(12px)',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>
          Pá {bladeIdx + 1} / {bladeCount}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {([
            ['Ângulo posição', `${bladeDeg}°`],
            ['β1 (entrada)', sizing ? `${sizing.beta1?.toFixed(1)}°` : '—'],
            ['β2 (saída)', sizing ? `${sizing.beta2?.toFixed(1)}°` : '—'],
            ['Razão De Haller', sizing ? ((sizing as any).diffusion_ratio ?? '—').toFixed?.(3) ?? '—' : '—'],
            ['Passo angular', `${pitchDeg.toFixed(1)}°`],
          ] as [string, string][]).map(([label, val]) => (
            <tr key={label}>
              <td style={{ color: 'var(--text-muted)', paddingBottom: 4, paddingRight: 10 }}>{label}</td>
              <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
