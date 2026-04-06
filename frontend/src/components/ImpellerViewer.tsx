import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, Html } from '@react-three/drei'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import t from '../i18n'
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

type DisplayMode = 'fechado' | 'semiaberto' | 'aberto'

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
  const merged = mergeVertices(g, 0.001)
  merged.computeVertexNormals()
  return merged
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

/** Span-gradient colormap: blue (hub) → white (mid) → red (shroud) */
function buildQuadGeoWithSpanGradient(grid: BladePoint[][]): THREE.BufferGeometry {
  const nSpan = grid.length
  const nChord = grid[0]?.length ?? 0
  const pos: number[] = []
  const colors: number[] = []

  const spanColor = (s: number): [number, number, number] => {
    const t = nSpan > 1 ? s / (nSpan - 1) : 0.5 // 0=hub, 1=shroud
    if (t < 0.5) {
      const f = t * 2
      return [0.15 + 0.85 * f, 0.39 + 0.49 * f, 0.93 - 0.05 * f] // blue→white
    } else {
      const f = (t - 0.5) * 2
      return [0.88 + 0.12 * f, 0.88 - 0.73 * f, 0.88 - 0.73 * f] // white→red
    }
  }

  const addTri = (
    p0: BladePoint, p1: BladePoint, p2: BladePoint,
    s0: number, s1: number, s2: number,
  ) => {
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
    const c0 = spanColor(s0), c1 = spanColor(s1), c2 = spanColor(s2)
    colors.push(...c0, ...c1, ...c2)
  }

  for (let s = 0; s < nSpan - 1; s++) {
    for (let c = 0; c < nChord - 1; c++) {
      const p00 = grid[s][c], p10 = grid[s + 1][c]
      const p01 = grid[s][c + 1], p11 = grid[s + 1][c + 1]
      addTri(p00, p10, p01, s, s + 1, s)
      addTri(p10, p11, p01, s + 1, s + 1, s)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

/** Mesh quality colormap: green (good AR~1) → yellow → red (poor AR>10) using actual aspect ratio */
function buildQuadGeoWithQualityColors(grid: BladePoint[][]): THREE.BufferGeometry {
  const nSpan = grid.length
  const nChord = grid[0]?.length ?? 0
  const pos: number[] = []
  const colors: number[] = []

  const dist = (a: BladePoint, b: BladePoint) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

  // Compute aspect-ratio-based quality at each grid node
  const qualityGrid: number[][] = []
  for (let s = 0; s < nSpan; s++) {
    const row: number[] = []
    for (let c = 0; c < nChord; c++) {
      // Chordwise cell size (dx)
      const dx = c < nChord - 1
        ? dist(grid[s][c], grid[s][c + 1])
        : dist(grid[s][c - 1], grid[s][c])
      // Spanwise cell size (dy)
      const dy = s < nSpan - 1
        ? dist(grid[s][c], grid[s + 1][c])
        : dist(grid[s - 1][c], grid[s][c])
      const ar = (dx > 0 && dy > 0) ? Math.max(dx / dy, dy / dx) : 1
      // Quality: AR=1 is perfect (q=1), AR>=11 is worst (q=0)
      const q = 1.0 - Math.min(1.0, (ar - 1) / 10)
      row.push(q)
    }
    qualityGrid.push(row)
  }

  const qColor = (q: number): [number, number, number] => {
    if (q > 0.5) return [0, 0.5 + 0.3 * q, 0.2 + 0.2 * q]  // green
    return [0.8 * (1 - q), 0.6 * q + 0.2, 0.1]  // yellow to red
  }

  const addTri = (
    p0: BladePoint, p1: BladePoint, p2: BladePoint,
    q0: number, q1: number, q2: number,
  ) => {
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
    const c0 = qColor(q0), c1 = qColor(q1), c2 = qColor(q2)
    colors.push(...c0, ...c1, ...c2)
  }

  for (let s = 0; s < nSpan - 1; s++) {
    for (let c = 0; c < nChord - 1; c++) {
      const p00 = grid[s][c], p10 = grid[s + 1][c]
      const p01 = grid[s][c + 1], p11 = grid[s + 1][c + 1]
      const q00 = qualityGrid[s][c], q10 = qualityGrid[s + 1][c]
      const q01 = qualityGrid[s][c + 1], q11 = qualityGrid[s + 1][c + 1]
      addTri(p00, p10, p01, q00, q10, q01)
      addTri(p10, p11, p01, q10, q11, q01)
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
  const merged = mergeVertices(g, 0.001)
  merged.computeVertexNormals()
  return merged
}

/** Hub back-disc: flat annular disc at the outlet z-plane */
function buildHubDiscGeo(hubProfile: BladePoint[], segs = 96): THREE.BufferGeometry {
  if (hubProfile.length < 2) return new THREE.BufferGeometry()
  // Find the disc plane: the point with largest r at lowest z (back disc outer edge)
  let r_outer = 0, z_disc = 0
  for (const p of hubProfile) {
    if (p.x > r_outer) { r_outer = p.x; z_disc = p.z }
  }
  // Shaft bore: ~18% of D2 radius — realistic pump bore with hub boss
  const r_inner = r_outer * 0.18
  const z = z_disc

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
  const merged = mergeVertices(g, 0.001)
  merged.computeVertexNormals()
  return merged
}

/** Build LE/TE edge caps between PS and SS to make blade look solid */
function buildBladeEdgeCaps(ps: BladePoint[][], ss: BladePoint[][]): THREE.BufferGeometry {
  const nSpan = ps.length
  const nChord = ps[0]?.length ?? 0
  if (nSpan < 2 || nChord < 2) return new THREE.BufferGeometry()
  const pos: number[] = []

  // Leading edge cap (chord index 0): rounded with midpoint bulge for semicircular profile
  for (let s = 0; s < nSpan - 1; s++) {
    const ps0 = ps[s][0], ps1 = ps[s + 1][0]
    const ss0 = ss[s][0], ss1 = ss[s + 1][0]

    // Local thickness at this span station
    const thickness0 = Math.sqrt((ps0.x - ss0.x) ** 2 + (ps0.y - ss0.y) ** 2 + (ps0.z - ss0.z) ** 2)
    const thickness1 = Math.sqrt((ps1.x - ss1.x) ** 2 + (ps1.y - ss1.y) ** 2 + (ps1.z - ss1.z) ** 2)

    // Midpoints between PS and SS at LE
    const mid0 = { x: (ps0.x + ss0.x) / 2, y: (ps0.y + ss0.y) / 2, z: (ps0.z + ss0.z) / 2 }
    const mid1 = { x: (ps1.x + ss1.x) / 2, y: (ps1.y + ss1.y) / 2, z: (ps1.z + ss1.z) / 2 }

    // Outward direction: from chord[1] toward chord[0] (upstream / inlet direction)
    const ch0 = nChord > 1 ? {
      x: ((ps[s][0].x + ss[s][0].x) - (ps[s][1].x + ss[s][1].x)) / 2,
      y: ((ps[s][0].y + ss[s][0].y) - (ps[s][1].y + ss[s][1].y)) / 2,
      z: ((ps[s][0].z + ss[s][0].z) - (ps[s][1].z + ss[s][1].z)) / 2,
    } : { x: 0, y: 0, z: 1 }
    const ch1 = nChord > 1 ? {
      x: ((ps[s + 1][0].x + ss[s + 1][0].x) - (ps[s + 1][1].x + ss[s + 1][1].x)) / 2,
      y: ((ps[s + 1][0].y + ss[s + 1][0].y) - (ps[s + 1][1].y + ss[s + 1][1].y)) / 2,
      z: ((ps[s + 1][0].z + ss[s + 1][0].z) - (ps[s + 1][1].z + ss[s + 1][1].z)) / 2,
    } : { x: 0, y: 0, z: 1 }

    // Normalize and apply bulge (35% of half-thickness for semicircle approximation)
    const len0 = Math.sqrt(ch0.x ** 2 + ch0.y ** 2 + ch0.z ** 2) || 1
    const len1 = Math.sqrt(ch1.x ** 2 + ch1.y ** 2 + ch1.z ** 2) || 1
    const bulge0 = thickness0 * 0.35
    const bulge1 = thickness1 * 0.35

    const m0 = { x: mid0.x + (ch0.x / len0) * bulge0, y: mid0.y + (ch0.y / len0) * bulge0, z: mid0.z + (ch0.z / len0) * bulge0 }
    const m1 = { x: mid1.x + (ch1.x / len1) * bulge1, y: mid1.y + (ch1.y / len1) * bulge1, z: mid1.z + (ch1.z / len1) * bulge1 }

    // PS half: PS0->M0->PS1, M0->M1->PS1
    pos.push(ps0.x, ps0.y, ps0.z, m0.x, m0.y, m0.z, ps1.x, ps1.y, ps1.z)
    pos.push(m0.x, m0.y, m0.z, m1.x, m1.y, m1.z, ps1.x, ps1.y, ps1.z)
    // SS half: M0->SS0->M1, SS0->SS1->M1
    pos.push(m0.x, m0.y, m0.z, ss0.x, ss0.y, ss0.z, m1.x, m1.y, m1.z)
    pos.push(ss0.x, ss0.y, ss0.z, ss1.x, ss1.y, ss1.z, m1.x, m1.y, m1.z)
  }

  // Trailing edge cap (chord index nChord-1) — thin by design (TE radius = 10% blade_thickness)
  // No rounding needed: sharp TE is physically correct
  const c = nChord - 1
  for (let s = 0; s < nSpan - 1; s++) {
    const ps0 = ps[s][c], ps1 = ps[s + 1][c]
    const ss0 = ss[s][c], ss1 = ss[s + 1][c]
    pos.push(ps0.x, ps0.y, ps0.z, ss0.x, ss0.y, ss0.z, ps1.x, ps1.y, ps1.z)
    pos.push(ss0.x, ss0.y, ss0.z, ss1.x, ss1.y, ss1.z, ps1.x, ps1.y, ps1.z)
  }

  // Hub/shroud edge caps (close the blade thickness at hub and shroud spans)
  // TODO: Future improvement — add hub-blade fillet geometry (radial bulge at span=0)
  // to suggest weld fillet. Requires offsetting hub-side midpoints toward hub surface.
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
  const merged = mergeVertices(g, 0.001)
  merged.computeVertexNormals()
  return merged
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
const BLADE_COLOR = '#b0b5bd'    // blade PS — matte steel gray
const BLADE_COLOR_ALT = '#9ea3ab' // blade SS — slightly darker
const HUB_COLOR = '#6a7080'       // hub — subtle dark matte (doesn't compete with blades)
const SPLITTER_COLOR = '#969ba3'  // splitter

// ─── ClipController ───────────────────────────────────────────────────────────

function ClipController({ clipZ, meridionalCut, freeClipAngle }: { clipZ: number | null; meridionalCut?: boolean; freeClipAngle?: number | null }) {
  const { gl } = useThree()
  useEffect(() => {
    const planes: THREE.Plane[] = []
    if (clipZ !== null) {
      planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), clipZ))
    }
    if (meridionalCut) {
      // Meridional section: clip at Y=0 plane (shows half the impeller)
      planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
    }
    if (freeClipAngle != null) {
      // Free rotation clipping plane around Z axis
      const rad = freeClipAngle * Math.PI / 180
      const normal = new THREE.Vector3(Math.cos(rad), Math.sin(rad), 0)
      planes.push(new THREE.Plane(normal, 0))
    }
    if (planes.length > 0) {
      gl.localClippingEnabled = true
      gl.clippingPlanes = planes
    } else {
      gl.clippingPlanes = []
      gl.localClippingEnabled = false
    }
    return () => {
      gl.clippingPlanes = []
      gl.localClippingEnabled = false
    }
  }, [clipZ, meridionalCut, freeClipAngle, gl])
  return null
}

// ─── Scene components ─────────────────────────────────────────────────────────

function BladeSurfaceMesh({
  surface, idx, showColormap, showLoadingMap, showSpanColors, showWireframe, showCFDMesh, loadingField, onSelect, isSelected, selectedBlade, sizing,
}: {
  surface: BladeSurface
  idx: number
  showColormap: boolean
  showLoadingMap?: boolean
  showSpanColors?: boolean
  showWireframe?: boolean
  showCFDMesh?: boolean
  loadingField?: BladeLoadingField | null
  onSelect: (idx: number) => void
  isSelected: boolean
  selectedBlade: number | null
  sizing?: SizingResult | null
}) {
  const [hovered, setHovered] = useState(false)
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null)

  const psGeo = useMemo(
    () => showCFDMesh
      ? buildQuadGeoWithQualityColors(surface.ps)
      : showLoadingMap && loadingField?.ps_rvtheta
        ? buildQuadGeoWithDivergingColors(surface.ps, loadingField.ps_rvtheta)
        : showSpanColors
          ? buildQuadGeoWithSpanGradient(surface.ps)
          : showColormap && surface.ps_pressure
            ? buildQuadGeoWithColors(surface.ps, surface.ps_pressure)
            : buildQuadGeo(surface.ps),
    [surface, showColormap, showLoadingMap, showSpanColors, showCFDMesh, loadingField],
  )
  const ssGeo = useMemo(
    () => showCFDMesh
      ? buildQuadGeoWithQualityColors(surface.ss)
      : showLoadingMap && loadingField?.ss_rvtheta
        ? buildQuadGeoWithDivergingColors(surface.ss, loadingField.ss_rvtheta)
        : showSpanColors
          ? buildQuadGeoWithSpanGradient(surface.ss)
          : showColormap && surface.ss_pressure
            ? buildQuadGeoWithColors(surface.ss, surface.ss_pressure)
            : buildQuadGeo(surface.ss),
    [surface, showColormap, showLoadingMap, showSpanColors, showCFDMesh, loadingField],
  )

  // Edge caps — close PS-SS gap to make blade look solid
  const capsGeo = useMemo(() => buildBladeEdgeCaps(surface.ps, surface.ss), [surface])

  const useVertexColors = showColormap || showLoadingMap || showSpanColors || showCFDMesh
  const highlight = isSelected || hovered
  const otherSelected = selectedBlade !== null && !isSelected
  // CFD passage highlight: blades 0 and 1 stay opaque, others fade
  const isCFDPassage = showCFDMesh && (idx === 0 || idx === 1)
  const cfdFade = showCFDMesh && !isCFDPassage
  const psColor = useVertexColors ? '#ffffff' : (highlight ? '#d0d8e0' : BLADE_COLOR)
  const ssColor = useVertexColors ? '#ffffff' : (highlight ? '#c0c8d0' : BLADE_COLOR_ALT)
  const capColor = useVertexColors ? '#ffffff' : (highlight ? '#bcc4cc' : '#8a929c')
  const emissive = isSelected ? '#1a2530' : hovered ? '#0f1a22' : '#000000'
  const bladeOpacity = cfdFade ? 0.15 : otherSelected ? 0.3 : 1.0
  const bladeTransparent = otherSelected || cfdFade

  return (
    <>
      <mesh geometry={psGeo} castShadow
        onClick={(e) => { e.stopPropagation(); onSelect(idx) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); setHoverPos(e.point.clone()) }}
        onPointerOut={() => { setHovered(false); setHoverPos(null) }}
      >
        <meshStandardMaterial
          vertexColors={useVertexColors}
          color={psColor}
          emissive={emissive}
          side={THREE.DoubleSide}
          metalness={0.15}
          roughness={0.75}
          transparent={bladeTransparent}
          opacity={bladeOpacity}
          depthWrite={!bladeTransparent}
        />
      </mesh>
      <mesh geometry={ssGeo} castShadow
        onClick={(e) => { e.stopPropagation(); onSelect(idx) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); setHoverPos(e.point.clone()) }}
        onPointerOut={() => { setHovered(false); setHoverPos(null) }}
      >
        <meshStandardMaterial
          vertexColors={useVertexColors}
          color={ssColor}
          emissive={emissive}
          side={THREE.DoubleSide}
          transparent={bladeTransparent}
          opacity={bladeOpacity}
          depthWrite={!bladeTransparent}
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
          transparent={bladeTransparent}
          opacity={bladeOpacity}
          depthWrite={!bladeTransparent}
        />
      </mesh>
      {/* Wireframe overlays */}
      {showWireframe && (
        <>
          <lineSegments geometry={new THREE.WireframeGeometry(psGeo)}>
            <lineBasicMaterial color="#555555" linewidth={1} transparent opacity={0.4} />
          </lineSegments>
          <lineSegments geometry={new THREE.WireframeGeometry(ssGeo)}>
            <lineBasicMaterial color="#555555" linewidth={1} transparent opacity={0.4} />
          </lineSegments>
        </>
      )}
      {/* Blade hover tooltip */}
      {hovered && hoverPos && (
        <Html position={[hoverPos.x, hoverPos.y, hoverPos.z]}>
          <div style={{
            background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '4px 8px',
            borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            {`Pa ${idx + 1}`}{sizing?.beta1 != null ? ` | \u03B21=${sizing.beta1.toFixed(1)}\u00B0` : ''}{sizing?.beta2 != null ? ` \u03B22=${sizing.beta2.toFixed(1)}\u00B0` : ''}
          </div>
        </Html>
      )}
    </>
  )
}

/** Hub-blade fillet: small ramp mesh at span=0 to smooth the sharp 90-degree edge */
function BladeFilletMesh({ surface }: { surface: BladeSurface }) {
  const filletGeo = useMemo(() => {
    const ps = surface.ps
    const ss = surface.ss
    const nChord = ps[0]?.length ?? 0
    if (nChord < 2 || ps.length < 2) return null
    const filletR = 1.5 // mm fillet radius
    const FILLET_SEGS = 4
    const pos: number[] = []

    for (let c = 0; c < nChord - 1; c++) {
      const ps0 = ps[0][c], ps1 = ps[0][c + 1]
      const ss0 = ss[0][c], ss1 = ss[0][c + 1]
      const r0 = Math.sqrt(ps0.x * ps0.x + ps0.y * ps0.y) || 1
      const r1 = Math.sqrt(ps1.x * ps1.x + ps1.y * ps1.y) || 1
      const sr0 = Math.sqrt(ss0.x * ss0.x + ss0.y * ss0.y) || 1
      const sr1 = Math.sqrt(ss1.x * ss1.x + ss1.y * ss1.y) || 1

      for (let f = 0; f < FILLET_SEGS; f++) {
        const a0 = (f / FILLET_SEGS) * Math.PI / 2
        const a1 = ((f + 1) / FILLET_SEGS) * Math.PI / 2

        const px00 = ps0.x + (ps0.x / r0) * filletR * Math.sin(a0)
        const py00 = ps0.y + (ps0.y / r0) * filletR * Math.sin(a0)
        const pz00 = ps0.z - filletR * (1 - Math.cos(a0))
        const px01 = ps0.x + (ps0.x / r0) * filletR * Math.sin(a1)
        const py01 = ps0.y + (ps0.y / r0) * filletR * Math.sin(a1)
        const pz01 = ps0.z - filletR * (1 - Math.cos(a1))
        const px10 = ps1.x + (ps1.x / r1) * filletR * Math.sin(a0)
        const py10 = ps1.y + (ps1.y / r1) * filletR * Math.sin(a0)
        const pz10 = ps1.z - filletR * (1 - Math.cos(a0))
        const px11 = ps1.x + (ps1.x / r1) * filletR * Math.sin(a1)
        const py11 = ps1.y + (ps1.y / r1) * filletR * Math.sin(a1)
        const pz11 = ps1.z - filletR * (1 - Math.cos(a1))
        pos.push(px00, py00, pz00, px01, py01, pz01, px10, py10, pz10)
        pos.push(px01, py01, pz01, px11, py11, pz11, px10, py10, pz10)

        const sx00 = ss0.x + (ss0.x / sr0) * filletR * Math.sin(a0)
        const sy00 = ss0.y + (ss0.y / sr0) * filletR * Math.sin(a0)
        const sz00 = ss0.z - filletR * (1 - Math.cos(a0))
        const sx01 = ss0.x + (ss0.x / sr0) * filletR * Math.sin(a1)
        const sy01 = ss0.y + (ss0.y / sr0) * filletR * Math.sin(a1)
        const sz01 = ss0.z - filletR * (1 - Math.cos(a1))
        const sx10 = ss1.x + (ss1.x / sr1) * filletR * Math.sin(a0)
        const sy10 = ss1.y + (ss1.y / sr1) * filletR * Math.sin(a0)
        const sz10 = ss1.z - filletR * (1 - Math.cos(a0))
        const sx11 = ss1.x + (ss1.x / sr1) * filletR * Math.sin(a1)
        const sy11 = ss1.y + (ss1.y / sr1) * filletR * Math.sin(a1)
        const sz11 = ss1.z - filletR * (1 - Math.cos(a1))
        pos.push(sx00, sy00, sz00, sx10, sy10, sz10, sx01, sy01, sz01)
        pos.push(sx01, sy01, sz01, sx10, sy10, sz10, sx11, sy11, sz11)
      }
    }

    if (pos.length === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [surface])

  if (!filletGeo) return null
  return (
    <mesh geometry={filletGeo}>
      <meshStandardMaterial color="#808898" metalness={0.15} roughness={0.65} side={THREE.DoubleSide} />
    </mesh>
  )
}

function BladeEdgeLines({ surface, visible }: { surface: BladeSurface; visible: boolean }) {
  const lineObjects = useMemo(() => {
    const ps = surface.ps
    const nSpan = ps.length
    const nChord = ps[0]?.length ?? 0
    if (nSpan < 2 || nChord < 2) return []

    const leMat = new THREE.LineBasicMaterial({ color: '#606878' }) // LE brighter
    const otherMat = new THREE.LineBasicMaterial({ color: '#404550' }) // other edges

    const results: THREE.Line[] = []
    // LE (hub to shroud along chord=0) — brighter/thicker
    const lePts = ps.map((row) => new THREE.Vector3(row[0].x, row[0].y, row[0].z))
    results.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(lePts), leMat))
    // TE (hub to shroud along chord=last)
    const tePts = ps.map((row) => new THREE.Vector3(row[nChord - 1].x, row[nChord - 1].y, row[nChord - 1].z))
    results.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tePts), otherMat))
    // Hub edge (along chord at span=0)
    const hubPts = ps[0].map((p) => new THREE.Vector3(p.x, p.y, p.z))
    results.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hubPts), otherMat))
    // Shroud edge (along chord at span=last)
    const shrPts = ps[nSpan - 1].map((p) => new THREE.Vector3(p.x, p.y, p.z))
    results.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(shrPts), otherMat))

    return results
  }, [surface])

  if (!visible || lineObjects.length === 0) return null

  return (
    <>
      {lineObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </>
  )
}

function VelocityArrows({ surface, scale, sizing }: {
  surface: BladeSurface; scale: number; sizing?: SizingResult | null
}) {
  const arrows = useMemo(() => {
    const nSpan = surface.ps.length
    if (nSpan < 2) return []
    const midSpan = Math.floor(nSpan / 2)
    const nChord = surface.ps[midSpan].length
    if (nChord < 2) return []

    const leP = surface.ps[midSpan][nChord - 1]
    const teP = surface.ps[midSpan][0]

    const arrowLen = 0.3
    const result: { dir: THREE.Vector3; origin: THREE.Vector3; color: number }[] = []

    const tangential = (p: BladePoint) => {
      const r = Math.sqrt(p.x * p.x + p.y * p.y) || 1
      return new THREE.Vector3(-p.y / r, p.x / r, 0)
    }

    const bladeDir = (spanIdx: number, chordIdx: number, forward: boolean) => {
      const ps = surface.ps[spanIdx]
      const c2 = forward
        ? Math.min(chordIdx + 1, ps.length - 1)
        : Math.max(chordIdx - 1, 0)
      const dx = ps[c2].x - ps[chordIdx].x
      const dy = ps[c2].y - ps[chordIdx].y
      const dz = ps[c2].z - ps[chordIdx].z
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      return new THREE.Vector3(dx / len, dy / len, dz / len)
    }

    const leOrigin = new THREE.Vector3(leP.x * scale, leP.y * scale, leP.z * scale)
    const u1Dir = tangential(leP)
    const w1Dir = bladeDir(midSpan, nChord - 1, false).negate()
    const c1Dir = u1Dir.clone().add(w1Dir).normalize()
    result.push({ dir: u1Dir, origin: leOrigin, color: 0xff4444 })
    result.push({ dir: w1Dir, origin: leOrigin, color: 0x4488ff })
    result.push({ dir: c1Dir, origin: leOrigin, color: 0x44cc44 })

    const teOrigin = new THREE.Vector3(teP.x * scale, teP.y * scale, teP.z * scale)
    const u2Dir = tangential(teP)
    const w2Dir = bladeDir(midSpan, 0, true)
    const c2Dir = u2Dir.clone().add(w2Dir).normalize()
    result.push({ dir: u2Dir, origin: teOrigin, color: 0xff4444 })
    result.push({ dir: w2Dir, origin: teOrigin, color: 0x4488ff })
    result.push({ dir: c2Dir, origin: teOrigin, color: 0x44cc44 })

    return result.map(a => new THREE.ArrowHelper(a.dir, a.origin, arrowLen, a.color, arrowLen * 0.25, arrowLen * 0.12))
  }, [surface, scale, sizing])

  return (
    <group>
      {arrows.map((arr, i) => (
        <primitive key={i} object={arr} />
      ))}
    </group>
  )
}

function SpanSectionLines({ surface, scale }: {
  surface: BladeSurface; scale: number
}) {
  const lines = useMemo(() => {
    const nSpan = surface.ps.length
    if (nSpan < 3) return []
    const count = Math.min(5, nSpan)
    const spans: number[] = []
    for (let i = 0; i < count; i++) {
      spans.push(Math.round(i * (nSpan - 1) / (count - 1)))
    }

    return spans.map(s => {
      const pts: THREE.Vector3[] = []
      for (const p of surface.ps[s]) {
        pts.push(new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      }
      for (let c = surface.ss[s].length - 1; c >= 0; c--) {
        const p = surface.ss[s][c]
        pts.push(new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      }
      if (pts.length > 0) pts.push(pts[0].clone())
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const mat = new THREE.LineBasicMaterial({ color: '#f0c040' })
      return new THREE.Line(geo, mat)
    })
  }, [surface, scale])

  return (
    <>
      {lines.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
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

function HubMesh({ profile, displayMode }: { profile: BladePoint[]; displayMode: DisplayMode }) {
  const geo = useMemo(() => buildRevolutionGeo(profile, 96), [profile])
  const discGeo = useMemo(() => buildHubDiscGeo(profile, 96), [profile])
  const showDisc = displayMode !== 'aberto'

  // Hub boss: a short cylinder (ring) around the bore hole
  const bossGeo = useMemo(() => {
    // Find bore radius and disc z from profile
    let r_outer_disc = 0, z_disc = 0
    for (const p of profile) {
      if (p.x > r_outer_disc) { r_outer_disc = p.x; z_disc = p.z }
    }
    const r_bore = r_outer_disc * 0.18
    const r_boss = r_bore * 1.5   // boss must be smaller than blade inlet radius
    const boss_height = r_bore * 1.0  // shorter, proportional

    // Create a hollow cylinder (ring) from r_bore to r_boss
    const segs = 48
    const pos: number[] = []
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2
      const a1 = ((j + 1) / segs) * Math.PI * 2

      // Top face (z = z_disc + boss_height)
      const zt = z_disc + boss_height
      pos.push(r_bore*Math.cos(a0), r_bore*Math.sin(a0), zt,
               r_boss*Math.cos(a0), r_boss*Math.sin(a0), zt,
               r_bore*Math.cos(a1), r_bore*Math.sin(a1), zt)
      pos.push(r_boss*Math.cos(a0), r_boss*Math.sin(a0), zt,
               r_boss*Math.cos(a1), r_boss*Math.sin(a1), zt,
               r_bore*Math.cos(a1), r_bore*Math.sin(a1), zt)

      // Outer wall (r = r_boss, from z_disc to z_disc+boss_height)
      pos.push(r_boss*Math.cos(a0), r_boss*Math.sin(a0), z_disc,
               r_boss*Math.cos(a0), r_boss*Math.sin(a0), zt,
               r_boss*Math.cos(a1), r_boss*Math.sin(a1), z_disc)
      pos.push(r_boss*Math.cos(a0), r_boss*Math.sin(a0), zt,
               r_boss*Math.cos(a1), r_boss*Math.sin(a1), zt,
               r_boss*Math.cos(a1), r_boss*Math.sin(a1), z_disc)

      // Inner wall (r = r_bore, from z_disc to z_disc+boss_height) — bore wall
      pos.push(r_bore*Math.cos(a0), r_bore*Math.sin(a0), zt,
               r_bore*Math.cos(a0), r_bore*Math.sin(a0), z_disc,
               r_bore*Math.cos(a1), r_bore*Math.sin(a1), zt)
      pos.push(r_bore*Math.cos(a0), r_bore*Math.sin(a0), z_disc,
               r_bore*Math.cos(a1), r_bore*Math.sin(a1), z_disc,
               r_bore*Math.cos(a1), r_bore*Math.sin(a1), zt)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [profile])

  // Keyway dimensions based on bore
  const keyDims = useMemo(() => {
    let r_outer_disc = 0, z_disc = 0
    for (const p of profile) {
      if (p.x > r_outer_disc) { r_outer_disc = p.x; z_disc = p.z }
    }
    const boreR = r_outer_disc * 0.18
    const keyWidth = boreR * 0.3
    const keyDepth = boreR * 0.2
    const keyHeight = boreR * 3
    return { boreR, keyWidth, keyDepth, keyHeight, z_disc }
  }, [profile])

  // Slightly lighter hub color for better visibility from front
  const hubColor = '#808898'
  return (
    <>
      {/* Hub curve surface — always visible, matte like blades */}
      <mesh geometry={geo} receiveShadow castShadow>
        <meshStandardMaterial color={hubColor} metalness={0.15} roughness={0.65} side={THREE.DoubleSide} />
      </mesh>
      {/* Hub back disc */}
      {showDisc && (
        <mesh geometry={discGeo} receiveShadow castShadow>
          <meshStandardMaterial color={hubColor} metalness={0.15} roughness={0.65} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Hub boss: raised ring around bore hole */}
      {showDisc && (
        <mesh geometry={bossGeo} castShadow receiveShadow>
          <meshStandardMaterial color="#808898" metalness={0.15} roughness={0.60} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Keyway removed — was protruding incorrectly. Real keyway is an internal groove. */}
    </>
  )
}


/** Shroud surface — shown semi-transparent in 'fechado' mode only */
function ShroudMesh({ profile, displayMode }: { profile: BladePoint[]; displayMode: DisplayMode }) {
  const geo = useMemo(() => buildRevolutionGeo(profile, 96), [profile])
  // Shroud outer rim — connects shroud shell to hub disc at outlet (z~0)
  const rimGeo = useMemo(() => {
    if (profile.length < 2) return null
    const outlet = profile[profile.length - 1]
    const r_outer = outlet.x
    const z_shroud = outlet.z
    const z_hub = 0
    const segs = 96
    const pos: number[] = []
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2
      const a1 = ((j + 1) / segs) * Math.PI * 2
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
  }, [profile])

  if (displayMode !== 'fechado') return null

  return (
    <>
      {/* Semi-transparent shroud shell — blades visible underneath */}
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial
          color={HUB_COLOR}
          metalness={0.15}
          roughness={0.70}
          transparent
          opacity={0.4}
          side={THREE.FrontSide}
          depthWrite={false}
        />
      </mesh>
      {/* Outer rim ring connecting shroud to hub at D2 */}
      {rimGeo && (
        <mesh geometry={rimGeo} castShadow receiveShadow>
          <meshStandardMaterial color={HUB_COLOR} metalness={0.80} roughness={0.20} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}

/** Wear ring (selo de desgaste): thin cylindrical sleeve at the eye opening */
function WearRing({ data, scale, displayMode }: { data: ImpellerData; scale: number; displayMode: DisplayMode }) {
  if (displayMode === 'aberto') return null

  const ringGeo = useMemo(() => {
    const r1 = (data.d1 || data.d2 * 0.35) * 500  // eye radius in mm
    const z_eye = data.shroud_profile?.length > 0
      ? Math.max(...data.shroud_profile.map(p => p.z))
      : r1 * 0.6

    const ringR = r1 * 1.02   // slightly larger than eye
    const ringHeight = 3       // mm axial extent
    const segs = 48
    const pos: number[] = []

    // Open cylinder (wear ring sleeve)
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2
      const a1 = ((j + 1) / segs) * Math.PI * 2
      const z0 = z_eye - ringHeight / 2
      const z1 = z_eye + ringHeight / 2
      // Outer wall
      pos.push(ringR * Math.cos(a0), ringR * Math.sin(a0), z0,
               ringR * Math.cos(a0), ringR * Math.sin(a0), z1,
               ringR * Math.cos(a1), ringR * Math.sin(a1), z0)
      pos.push(ringR * Math.cos(a0), ringR * Math.sin(a0), z1,
               ringR * Math.cos(a1), ringR * Math.sin(a1), z1,
               ringR * Math.cos(a1), ringR * Math.sin(a1), z0)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [data])

  const z_eye = data.shroud_profile?.length > 0
    ? Math.max(...data.shroud_profile.map(p => p.z))
    : ((data.d1 || data.d2 * 0.35) * 500) * 0.6
  const r1 = (data.d1 || data.d2 * 0.35) * 500
  const ringR = r1 * 1.02

  return (
    <group scale={[scale, scale, scale]}>
      <mesh geometry={ringGeo}>
        <meshStandardMaterial color="#607080" metalness={0.2} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[ringR * 1.08 * scale, 0, z_eye * scale]} center distanceFactor={8}
        style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 9, background: 'rgba(0,0,0,0.7)', color: '#8af',
          padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap',
        }}>Selo</div>
      </Html>
    </group>
  )
}

function RotatingGroup({ children, paused, rpm, turntable }: { children: React.ReactNode; paused?: boolean; rpm?: number; turntable?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  // Rotation speed: simulate ~1/10 of real RPM for visual effect
  const speed = rpm ? (rpm / 60) * Math.PI * 2 * 0.04 : 0.5
  const turntableSpeed = Math.PI * 2 / 10 // 1 rev per 10 seconds
  useFrame((_, d) => {
    if (ref.current) {
      if (turntable) {
        ref.current.rotation.z += d * turntableSpeed
      } else if (!paused) {
        ref.current.rotation.z += d * speed
      }
    }
  })
  return <group ref={ref}>{children}</group>
}

function SceneLights() {
  // CAD-style lighting: high ambient + soft shadow from key light for depth
  return (
    <>
      <ambientLight intensity={0.85} />
      {/* Key light with soft shadow — gives blade-on-hub depth cues */}
      <directionalLight
        position={[3, 4, 5]}
        intensity={1.0}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-radius={4}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      {/* Fill from opposite — nearly same intensity for even lighting */}
      <directionalLight position={[-3, 2, 4]} intensity={0.8} color="#f4f4f4" />
      {/* Under fill — prevents dark underside */}
      <directionalLight position={[0, -3, 2]} intensity={0.4} color="#e8e8e8" />
      {/* Back light — illuminates hub disc and back face */}
      <directionalLight position={[0, 0, -4]} intensity={0.5} color="#d0d4dc" />
      {/* Side rim — defines blade edges from the side */}
      <directionalLight position={[4, -1, -1]} intensity={0.3} color="#e0e4ec" />
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
   * Realistic volute with tongue, growing circular cross-sections, and
   * tangential discharge nozzle. 48 circumferential x 16 cross-section segments.
   */
  const r2 = d2Mm / 2                    // impeller outlet radius [mm]
  const r_tongue = r2 * 1.05             // tongue at 5% gap from impeller
  const r_collector = r2 * 1.50          // outer scroll radius at 360 deg
  const b_volute = r2 * 0.50             // axial half-width of volute

  // Tongue cross-section radius (very small) and discharge cross-section radius
  const sect_r_min = r2 * 0.04           // small opening at tongue (0 deg)
  const sect_r_max = (r_collector - r_tongue) * 0.52 // large opening at 360 deg

  const N_THETA = 48                     // circumferential divisions
  const N_SECT = 16                      // cross-section divisions (circular ring)

  const pos: number[] = []

  const getRing = (theta: number): Array<[number, number, number]> => {
    const frac = theta / (Math.PI * 2)
    // Spiral center radius grows linearly
    const r_center = r_tongue + (r_collector - r_tongue) * frac * 0.5
    // Cross-section radius grows linearly from tongue to discharge
    const sect_r = sect_r_min + (sect_r_max - sect_r_min) * frac
    // Aspect ratio: slightly taller than wide (axial > radial)
    const aspectZ = Math.min(1.3, 0.8 + frac * 0.5)
    const ring: Array<[number, number, number]> = []
    for (let j = 0; j <= N_SECT; j++) {
      const phi = (j / N_SECT) * Math.PI * 2
      const dr = sect_r * Math.cos(phi)
      const dz = sect_r * Math.sin(phi) * aspectZ
      // Clamp dz to volute axial width
      const dzClamped = Math.max(-b_volute, Math.min(b_volute, dz))
      const r = r_center + dr
      const x = r * Math.cos(theta)
      const y = r * Math.sin(theta)
      ring.push([x, y, dzClamped])
    }
    return ring
  }

  for (let i = 0; i < N_THETA; i++) {
    const theta0 = (i / N_THETA) * Math.PI * 2
    const theta1 = ((i + 1) / N_THETA) * Math.PI * 2

    const ring0 = getRing(theta0)
    const ring1 = getRing(theta1)

    for (let j = 0; j < N_SECT; j++) {
      const [x00, y00, z00] = ring0[j]
      const [x01, y01, z01] = ring0[j + 1]
      const [x10, y10, z10] = ring1[j]
      const [x11, y11, z11] = ring1[j + 1]
      pos.push(x00, y00, z00, x10, y10, z10, x01, y01, z01)
      pos.push(x10, y10, z10, x11, y11, z11, x01, y01, z01)
    }
  }

  // Tongue cap: close the smallest cross-section at theta=0 with a filled disc
  const tongueRing = getRing(0)
  const tcx = tongueRing.reduce((s, p) => s + p[0], 0) / tongueRing.length
  const tcy = tongueRing.reduce((s, p) => s + p[1], 0) / tongueRing.length
  const tcz = tongueRing.reduce((s, p) => s + p[2], 0) / tongueRing.length
  for (let j = 0; j < N_SECT; j++) {
    const [x0, y0, z0] = tongueRing[j]
    const [x1, y1, z1] = tongueRing[j + 1]
    pos.push(tcx, tcy, tcz, x0, y0, z0, x1, y1, z1)
  }

  // Discharge nozzle: conical transition at 360 deg, tangential direction
  // At theta=2pi the scroll exits tangentially (along +Y at x=r_center)
  const lastRing = getRing(Math.PI * 2 * (N_THETA - 0.5) / N_THETA)
  const nozzle_len = r2 * 0.9
  const nozzle_taper = 0.85 // slight conical taper
  const exitTheta = Math.PI * 2 // tangent direction at 360 deg
  // Tangent direction at exit: perpendicular to radial = (-sin, cos, 0)
  const tx = -Math.sin(exitTheta)
  const ty = Math.cos(exitTheta)
  const N_NOZZLE = 16
  // Build exit ring (slightly smaller = conical)
  const exitRing: Array<[number, number, number]> = lastRing.map(([x, y, z]) => {
    const cx = lastRing.reduce((s, p) => s + p[0], 0) / lastRing.length
    const cy = lastRing.reduce((s, p) => s + p[1], 0) / lastRing.length
    const cz = lastRing.reduce((s, p) => s + p[2], 0) / lastRing.length
    return [
      cx + (x - cx) * nozzle_taper + tx * nozzle_len,
      cy + (y - cy) * nozzle_taper + ty * nozzle_len,
      cz + (z - cz) * nozzle_taper,
    ]
  })
  for (let j = 0; j < Math.min(N_NOZZLE, lastRing.length - 1); j++) {
    const [x00, y00, z00] = lastRing[j]
    const [x01, y01, z01] = lastRing[j + 1]
    const [x10, y10, z10] = exitRing[j]
    const [x11, y11, z11] = exitRing[j + 1]
    pos.push(x00, y00, z00, x10, y10, z10, x01, y01, z01)
    pos.push(x10, y10, z10, x11, y11, z11, x01, y01, z01)
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

// ─── Flow streamlines (realistic passage flow) ─────────────────────────────

function FlowStreamlines({ data, scale, active }: { data: ImpellerData; scale: number; active: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const clockRef = useRef(0)

  const N_LINES = 6
  const N_PTS = 50

  // Build streamline curves
  const curves = useMemo(() => {
    const bc = data.blade_count || 5
    const pitchAngle = (Math.PI * 2) / bc
    const hub = data.hub_profile
    const shr = data.shroud_profile
    if (!hub.length || !shr.length) return []

    const wrapRad = (data.actual_wrap_angle ?? 90) * Math.PI / 180

    const result: THREE.CatmullRomCurve3[] = []
    for (let lane = 0; lane < N_LINES; lane++) {
      // Distribute lanes across the first blade passage, at varying span positions
      const spanR = (lane + 0.5) / N_LINES
      const thetaBase = pitchAngle * 0.5 // mid-passage

      const pts: THREE.Vector3[] = []
      for (let k = 0; k < N_PTS; k++) {
        const t = k / (N_PTS - 1)
        const idx = Math.min(Math.floor(t * (hub.length - 1)), hub.length - 2)
        const frac = t * (hub.length - 1) - idx

        const hx = hub[idx].x + frac * (hub[idx + 1].x - hub[idx].x)
        const hz = hub[idx].z + frac * (hub[idx + 1].z - hub[idx].z)
        const sx = shr[idx].x + frac * (shr[idx + 1].x - shr[idx].x)
        const sz = shr[idx].z + frac * (shr[idx + 1].z - shr[idx].z)

        const r = (hx + spanR * (sx - hx)) * scale
        const z = (hz + spanR * (sz - hz)) * scale
        const theta = thetaBase + t * wrapRad

        pts.push(new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), z))
      }
      result.push(new THREE.CatmullRomCurve3(pts))
    }
    return result
  }, [data, scale])

  // Build tube geometries and color attributes
  const tubes = useMemo(() => {
    return curves.map((curve) => {
      const tubeGeo = new THREE.TubeGeometry(curve, N_PTS - 1, 0.0005 * (1 / scale), 4, false)
      // Add vertex colors: blue at inlet -> green at outlet
      const count = tubeGeo.attributes.position.count
      const colors = new Float32Array(count * 3)
      // Get bounding box to map position to progress
      tubeGeo.computeBoundingBox()
      const positions = tubeGeo.attributes.position
      for (let i = 0; i < count; i++) {
        // Use the progress along curve as approximation via distance from first point
        const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i)
        // Approximate progress: project onto the curve direction
        const firstPt = curve.getPoint(0)
        const lastPt = curve.getPoint(1)
        const totalDist = firstPt.distanceTo(lastPt)
        const curDist = new THREE.Vector3(px, py, pz).distanceTo(firstPt)
        const t = Math.min(1, curDist / (totalDist || 1))
        // Blue (0,0.3,1) -> Cyan (0,0.8,0.8) -> Green (0.2,0.9,0.3)
        colors[i * 3] = t * 0.2
        colors[i * 3 + 1] = 0.3 + t * 0.6
        colors[i * 3 + 2] = 1.0 - t * 0.7
      }
      tubeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      return tubeGeo
    })
  }, [curves, scale])

  // Animate: shift material offset for flowing effect
  useFrame((_, delta) => {
    if (!active || !groupRef.current) return
    clockRef.current += delta
    // Rotate streamlines group slightly to simulate flow (visual trick)
    groupRef.current.children.forEach((child) => {
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
        if (mat.opacity !== undefined) {
          // Pulsing opacity for flow animation
          mat.opacity = 0.6 + 0.3 * Math.sin(clockRef.current * 3)
        }
      }
    })
  })

  if (!active || tubes.length === 0) return null

  return (
    <group ref={groupRef}>
      {tubes.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── Meridional streamlines ──────────────────────────────────────────────────

function MeridionalLines({ hubProfile, shroudProfile, scale }: {
  hubProfile: BladePoint[]
  shroudProfile: BladePoint[]
  scale: number
}) {
  const lines = useMemo(() => {
    const hubPts = hubProfile.map(p => new THREE.Vector3(p.x * scale, 0, p.z * scale))
    const shrPts = shroudProfile.map(p => new THREE.Vector3(p.x * scale, 0, p.z * scale))
    const hubGeo = new THREE.BufferGeometry().setFromPoints(hubPts)
    const shrGeo = new THREE.BufferGeometry().setFromPoints(shrPts)
    const hubMat = new THREE.LineBasicMaterial({ color: '#f59e0b', linewidth: 2 })
    const shrMat = new THREE.LineBasicMaterial({ color: '#06b6d4', linewidth: 2 })
    return [
      new THREE.Line(hubGeo, hubMat),
      new THREE.Line(shrGeo, shrMat),
    ]
  }, [hubProfile, shroudProfile, scale])

  return (
    <group>
      {lines.map((obj, i) => <primitive key={i} object={obj} />)}
    </group>
  )
}

// ─── CFD mesh overlay components ─────────────────────────────────────────────

type MeshDensity = 'grosso' | 'medio' | 'fino'

function CFDMeshLines({ surface, scale, meshDensity = 'medio' }: { surface: BladeSurface; scale: number; meshDensity?: MeshDensity }) {
  const lines = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const ps = surface.ps
    const ss = surface.ss
    const nSpan = ps.length
    const nChord = ps[0]?.length ?? 0

    // Skip factor: grosso=4, medio=2, fino=1
    const chordSkip = meshDensity === 'grosso' ? 4 : meshDensity === 'medio' ? 2 : 1
    const spanSkip = chordSkip

    // Chordwise lines (along each span station) -- on PS
    for (let s = 0; s < nSpan; s += spanSkip) {
      const pts = ps[s].map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    // Spanwise lines (along each chord station) -- on PS
    for (let c = 0; c < nChord; c += chordSkip) {
      const pts = ps.map(row => new THREE.Vector3(row[c].x * scale, row[c].y * scale, row[c].z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    // Chordwise lines -- on SS
    for (let s = 0; s < nSpan; s += spanSkip) {
      const pts = ss[s].map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    // Spanwise lines -- on SS
    for (let c = 0; c < nChord; c += chordSkip) {
      const pts = ss.map(row => new THREE.Vector3(row[c].x * scale, row[c].y * scale, row[c].z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    return geos
  }, [surface, scale, meshDensity])

  return (
    <>
      {lines.map((geo, i) => (
        <primitive key={i} object={(() => {
          const mat = new THREE.LineBasicMaterial({ color: '#00cc88', transparent: true, opacity: 0.6 })
          return new THREE.Line(geo, mat)
        })()} />
      ))}
    </>
  )
}

function HubShroudMeshLines({ hubProfile, shroudProfile, scale, meshDensity = 'medio' }: {
  hubProfile: BladePoint[]
  shroudProfile: BladePoint[]
  scale: number
  meshDensity?: MeshDensity
}) {
  const lines = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    // Circumferential divisions: grosso=6, medio=12, fino=24
    const N_CIRC = meshDensity === 'grosso' ? 6 : meshDensity === 'medio' ? 12 : 24
    // Number of meridional rings
    const nRings = meshDensity === 'grosso' ? 6 : meshDensity === 'medio' ? 12 : 24

    // Hub: circumferential rings at several meridional stations
    for (let i = 0; i < hubProfile.length; i += Math.max(1, Math.floor(hubProfile.length / nRings))) {
      const p = hubProfile[i]
      const r = p.x * scale, z = p.z * scale
      const pts: THREE.Vector3[] = []
      for (let j = 0; j <= N_CIRC; j++) {
        const a = (j / N_CIRC) * Math.PI * 2
        pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z))
      }
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    // Hub: meridional lines at several angular positions
    const nMeridional = meshDensity === 'grosso' ? 6 : meshDensity === 'medio' ? 12 : 24
    for (let j = 0; j < nMeridional; j++) {
      const a = (j / nMeridional) * Math.PI * 2
      const pts = hubProfile.map(p => {
        const r = p.x * scale, z = p.z * scale
        return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z)
      })
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    // Shroud: circumferential rings
    for (let i = 0; i < shroudProfile.length; i += Math.max(1, Math.floor(shroudProfile.length / nRings))) {
      const p = shroudProfile[i]
      const r = p.x * scale, z = p.z * scale
      const pts: THREE.Vector3[] = []
      for (let j = 0; j <= N_CIRC; j++) {
        const a = (j / N_CIRC) * Math.PI * 2
        pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z))
      }
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    // Shroud: meridional lines
    for (let j = 0; j < nMeridional; j++) {
      const a = (j / nMeridional) * Math.PI * 2
      const pts = shroudProfile.map(p => {
        const r = p.x * scale, z = p.z * scale
        return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z)
      })
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    return geos
  }, [hubProfile, shroudProfile, scale, meshDensity])

  return (
    <>
      {lines.map((geo, i) => (
        <primitive key={i} object={(() => {
          const mat = new THREE.LineBasicMaterial({ color: '#00aacc', transparent: true, opacity: 0.5 })
          return new THREE.Line(geo, mat)
        })()} />
      ))}
    </>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

// ─── O-grid boundary layer around blade ──────────────────────────────────────

function BladeBoundaryLayer({ surface, scale, nLayers = 5 }: { surface: BladeSurface; scale: number; nLayers?: number }) {
  const lines = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const ps = surface.ps, ss = surface.ss
    const nSpan = ps.length, nChord = ps[0]?.length ?? 0
    if (nSpan < 3 || nChord < 2) return geos

    // Draw offset curves at mid-span around the blade profile
    const midS = Math.floor(nSpan / 2)

    for (let layer = 1; layer <= nLayers; layer++) {
      // Offset distance grows exponentially (first cell ratio ~1.3)
      const offset = 0.5 * Math.pow(1.3, layer) // mm

      // PS offset outward (toward next span = away from blade center)
      const psPts: THREE.Vector3[] = []
      for (let c = 0; c < nChord; c++) {
        const p = ps[midS][c]
        const pInner = ps[Math.max(0, midS - 1)][c]
        const pOuter = ps[Math.min(nSpan - 1, midS + 1)][c]
        const nx = pOuter.x - pInner.x, ny = pOuter.y - pInner.y, nz = pOuter.z - pInner.z
        const mag = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        psPts.push(new THREE.Vector3(
          (p.x + nx / mag * offset) * scale,
          (p.y + ny / mag * offset) * scale,
          (p.z + nz / mag * offset) * scale,
        ))
      }
      geos.push(new THREE.BufferGeometry().setFromPoints(psPts))

      // SS offset (opposite direction)
      const ssPts: THREE.Vector3[] = []
      for (let c = 0; c < nChord; c++) {
        const p = ss[midS][c]
        const pInner = ss[Math.max(0, midS - 1)][c]
        const pOuter = ss[Math.min(nSpan - 1, midS + 1)][c]
        const nx = pOuter.x - pInner.x, ny = pOuter.y - pInner.y, nz = pOuter.z - pInner.z
        const mag = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        ssPts.push(new THREE.Vector3(
          (p.x - nx / mag * offset) * scale,
          (p.y - ny / mag * offset) * scale,
          (p.z - nz / mag * offset) * scale,
        ))
      }
      geos.push(new THREE.BufferGeometry().setFromPoints(ssPts))
    }
    return geos
  }, [surface, scale, nLayers])

  return (
    <>
      {lines.map((geo, i) => (
        <primitive key={i} object={new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: '#ffaa00', transparent: true, opacity: 0.4 + (i % 5) * 0.05,
        }))} />
      ))}
    </>
  )
}

// ─── CFD domain inlet/outlet faces ──────────────────────────────────────────

function CFDDomainFaces({ data, scale }: { data: ImpellerData; scale: number }) {
  const r2 = data.d2 * 500 * scale
  const r1 = (data.d1 || data.d2 * 0.35) * 500 * scale
  const z_inlet = data.shroud_profile?.length > 0
    ? Math.max(...data.shroud_profile.map(p => p.z)) * scale
    : r2 * 0.3
  // Hub bore radius for inlet ring inner edge
  const r_bore = r1 * 0.3

  // Outlet height: from hub z=0 to shroud z at outlet (last point of shroud profile)
  const z_outlet_top = data.shroud_profile?.length > 0
    ? data.shroud_profile[data.shroud_profile.length - 1].z * scale
    : 0

  return (
    <>
      {/* Inlet face: blue semi-transparent annular ring at z=z_inlet */}
      <mesh position={[0, 0, z_inlet]} rotation={[0, 0, 0]}>
        <ringGeometry args={[r_bore, r1, 48]} />
        <meshBasicMaterial color="#0088ff" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* Outlet face: red semi-transparent ring at z=0 (disc plane), r=D2/2 */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <ringGeometry args={[r2 * 0.95, r2 * 1.05, 48]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

// ─── Periodic boundary lines ────────────────────────────────────────────────

function PeriodicBoundaryLines({ blade0, blade1, scale }: {
  blade0: BladeSurface; blade1: BladeSurface; scale: number
}) {
  const lines = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []

    // Periodic boundary 1: PS edge of blade 0 (hub + shroud chordwise lines)
    const ps0Hub = blade0.ps[0]
    if (ps0Hub?.length > 1) {
      const pts = ps0Hub.map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }
    const ps0Shr = blade0.ps[blade0.ps.length - 1]
    if (ps0Shr?.length > 1) {
      const pts = ps0Shr.map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    // Periodic boundary 2: SS edge of blade 1 (hub + shroud chordwise lines)
    const ss1Hub = blade1.ss[0]
    if (ss1Hub?.length > 1) {
      const pts = ss1Hub.map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }
    const ss1Shr = blade1.ss[blade1.ss.length - 1]
    if (ss1Shr?.length > 1) {
      const pts = ss1Shr.map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale))
      geos.push(new THREE.BufferGeometry().setFromPoints(pts))
    }

    return geos
  }, [blade0, blade1, scale])

  // Apply dashed line rendering: must call computeLineDistances for dashed material
  const lineObjects = useMemo(() => {
    return lines.map(geo => {
      const mat = new THREE.LineDashedMaterial({
        color: '#ffdd00', transparent: true, opacity: 0.7,
        dashSize: 0.02, gapSize: 0.01,
      })
      const line = new THREE.Line(geo, mat)
      line.computeLineDistances()
      return line
    })
  }, [lines])

  return (
    <>
      {lineObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </>
  )
}

// ─── CFD info panel overlay ─────────────────────────────────────────────────

function CFDInfoPanel({ data, meshDensity, rpm, flowRate, head }: {
  data: ImpellerData; meshDensity: MeshDensity; rpm: number; flowRate: number; head: number
}) {
  const [downloading, setDownloading] = useState(false)

  // Y+ estimation
  // Re = rho * u2 * D2 / mu  (water at 20C: rho=998, mu=1.003e-3)
  const rho = 998
  const mu = 1.003e-3
  const u2 = Math.PI * data.d2 * rpm / 60  // tip speed m/s
  const Re = rho * u2 * data.d2 / mu
  const Cf = 0.058 * Math.pow(Math.max(Re, 1), -0.2)
  const u_tau = u2 * Math.sqrt(Cf / 2)

  // First cell height based on density
  const y1Map: Record<MeshDensity, number> = { grosso: 0.5e-3, medio: 0.15e-3, fino: 0.01e-3 }  // meters
  const y1 = y1Map[meshDensity]
  const yPlus = (y1 * u_tau * rho) / mu

  // Element count estimation
  const nSpan = data.blade_surfaces[0]?.ps?.length ?? 10
  const nChord = data.blade_surfaces[0]?.ps?.[0]?.length ?? 10
  const skip = meshDensity === 'grosso' ? 4 : meshDensity === 'medio' ? 2 : 1
  const nSpanEff = Math.ceil(nSpan / skip)
  const nChordEff = Math.ceil(nChord / skip)
  const nPitchDiv = meshDensity === 'grosso' ? 8 : meshDensity === 'medio' ? 16 : 32
  const nBLLayers = meshDensity === 'grosso' ? 3 : meshDensity === 'medio' ? 8 : 20
  const nElements = nChordEff * nSpanEff * nPitchDiv * nBLLayers * data.blade_count

  const formatCount = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${n}`

  const handleDownloadCFX = async () => {
    setDownloading(true)
    try {
      const resp = await fetch('/api/v1/cfd/ansys/cfx/package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_rate: flowRate / 3600, head, rpm }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cfx_package.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CFX package download failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16,
      background: 'rgba(10,15,20,0.92)',
      border: '1px solid rgba(0,200,136,0.4)',
      borderRadius: 8, padding: '10px 14px', minWidth: 200,
      backdropFilter: 'blur(12px)',
      zIndex: 10, fontSize: 11,
    }}>
      <div style={{ color: '#00cc88', fontWeight: 600, fontSize: 12, marginBottom: 8 }}>
        Malha CFD
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {([
            ['Y+ estimado', `~${yPlus.toFixed(0)}`],
            ['Elementos estimados', `~${formatCount(nElements)}`],
            ['Tipo de malha', 'H/O-grid estruturada'],
            ['Solver sugerido', 'SST k-\u03C9'],
            ['Re (ponta)', `${(Re / 1e6).toFixed(2)}M`],
            ['u2 (ponta)', `${u2.toFixed(1)} m/s`],
            ['Exportar malha', 'STEP + ANSYS TurboGrid'],
          ] as [string, string][]).map(([label, val]) => (
            <tr key={label}>
              <td style={{ color: 'var(--text-muted)', paddingBottom: 3, paddingRight: 8 }}>{label}</td>
              <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={handleDownloadCFX}
        disabled={downloading}
        style={{
          marginTop: 8, width: '100%', padding: '6px 0',
          background: downloading ? 'rgba(0,200,136,0.2)' : 'rgba(0,200,136,0.15)',
          border: '1px solid rgba(0,200,136,0.5)',
          borderRadius: 5, color: '#00cc88', fontSize: 11,
          fontWeight: 600, cursor: downloading ? 'wait' : 'pointer',
          transition: 'background 0.2s',
        }}
        onMouseEnter={e => { if (!downloading) (e.target as HTMLElement).style.background = 'rgba(0,200,136,0.3)' }}
        onMouseLeave={e => { if (!downloading) (e.target as HTMLElement).style.background = 'rgba(0,200,136,0.15)' }}
      >
        {downloading ? 'Gerando...' : 'Download Pacote CFX'}
      </button>
    </div>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
  data, paused, rpm, showSplitters, clipZ, meridionalCut, freeClipAngle, showColormap, showLoadingMap, showSpanColors, showWireframe, showCFDMesh, showBladeNumbers, showMeridionalLines, loadingData, showParticles, showStreamlines, showVolute, displayMode,
  selectedBlade, onSelectBlade, showDimensions, cameraPos, showEdges, explodeAmount, componentExplode,
  showVelocityArrows, showSections, turntable, sizing, meshDensity,
  measureMode, measurePoints, onMeasureClick,
}: {
  data: ImpellerData
  paused?: boolean
  rpm?: number
  showSplitters?: boolean
  clipZ: number | null
  meridionalCut?: boolean
  freeClipAngle?: number | null
  showColormap: boolean
  showLoadingMap?: boolean
  showSpanColors?: boolean
  showWireframe?: boolean
  showCFDMesh?: boolean
  showBladeNumbers?: boolean
  showMeridionalLines?: boolean
  loadingData?: BladeLoadingData | null
  showParticles: boolean
  showStreamlines?: boolean
  showVolute: boolean
  displayMode: DisplayMode
  selectedBlade: number | null
  onSelectBlade: (idx: number) => void
  showDimensions?: boolean
  cameraPos?: [number, number, number]
  showEdges?: boolean
  explodeAmount?: number
  componentExplode?: number
  showVelocityArrows?: boolean
  showSections?: boolean
  turntable?: boolean
  sizing?: SizingResult | null
  meshDensity?: MeshDensity
  measureMode?: boolean
  measurePoints?: {x:number,y:number,z:number}[]
  onMeasureClick?: (point: {x:number,y:number,z:number}) => void
}) {
  // Normalize scale to fit in a ~2-unit radius
  const r2_mm = (data.d2 * 500) || 1   // d2 in m → r2 in mm → scale factor
  const scale = 1.8 / r2_mm

  // Assembly animation: blades fly into position on load
  const [assemblyT, setAssemblyT] = useState(0)
  const assemblyRef = useRef(0)
  // Auto-rotate: slow 30deg sweep after assembly completes
  const autoRotateRef = useRef(0)
  const sceneGroupRef = useRef<THREE.Group>(null)

  useEffect(() => {
    assemblyRef.current = 0
    autoRotateRef.current = 0
    setAssemblyT(0)
  }, [data])

  useFrame((_, delta) => {
    if (assemblyRef.current < 1) {
      assemblyRef.current = Math.min(1, assemblyRef.current + delta * 1.5)
      setAssemblyT(assemblyRef.current)
    } else if (autoRotateRef.current < 1 && sceneGroupRef.current) {
      // Decelerating 30deg rotation over ~2 seconds after assembly finishes
      autoRotateRef.current = Math.min(1, autoRotateRef.current + delta * 0.5)
      const ease = 1 - autoRotateRef.current
      sceneGroupRef.current.rotation.z += delta * (Math.PI / 6) * ease
    }
  })

  const camKey = cameraPos ? cameraPos.join(',') : '2.5,1.8,3.5'
  const camPosition = cameraPos || [2.5, 1.8, 3.5] as [number, number, number]

  // Dimension values in mm
  const d2mm = (data.d2 * 1000).toFixed(0)
  const d1mm = data.d1 ? (data.d1 * 1000).toFixed(0) : null
  const b2mm = data.b2 ? (data.b2 * 1000).toFixed(0) : null
  const r2 = data.d2 * 500  // radius in mm
  const r1 = data.d1 ? data.d1 * 500 : r2 * 0.5
  const z_eye = data.shroud_profile?.length > 0 ? data.shroud_profile[0].z : r2 * 0.3

  const dimLabelStyle: React.CSSProperties = {
    fontSize: 10, background: 'rgba(255,255,255,0.88)', color: '#1a1a2e',
    padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' as const,
    fontWeight: 600, pointerEvents: 'none' as const,
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  }

  return (
    <>
      {/* 3/4 elevated — shows blades, hub disc, and eye clearly */}
      <PerspectiveCamera makeDefault position={camPosition} fov={34} key={camKey} />
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={1.5} maxDistance={12} target={[0, 0, 0]} />
      <SceneLights />
      {/* No environment map — solid matte look like Inventor/SolidWorks */}
      <ClipController clipZ={clipZ} meridionalCut={meridionalCut} freeClipAngle={freeClipAngle} />

      {/* Fix 6: Light background plane for CAD-style */}
      <mesh position={[0, 0, -3]} rotation={[0, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial color="#1a2030" />
      </mesh>

      {/* Point light inside eye — illuminates blade passages */}
      <pointLight position={[0, 0, z_eye * scale * 0.5]} intensity={0.5} distance={3} color="#e8f0ff" />

      <group ref={sceneGroupRef}>
      <RotatingGroup paused={paused} rpm={rpm} turntable={turntable}>
        <group scale={[scale, scale, scale]}>
          {/* Component explode: hub disc moves down, shroud moves up */}
          <group position={[0, 0, -(componentExplode ?? 0) / 100 * 0.3 * data.d2 * 1000]}>
            <HubMesh profile={data.hub_profile} displayMode={displayMode} />
          </group>
          <group position={[0, 0, (componentExplode ?? 0) / 100 * 0.3 * data.d2 * 1000]}>
            <ShroudMesh profile={data.shroud_profile} displayMode={displayMode} />
            {/* Wear ring removed — part of casing, not impeller */}
          </group>
          {/* No separate shaft geometry — hub revolution includes the bore */}
          {data.blade_surfaces.map((surf, i) => {
            const bladeAngle = (i / data.blade_count) * Math.PI * 2
            const eased = 1 - Math.pow(1 - assemblyT, 3)
            const animOffset = (1 - eased) * r2_mm * 0.5
            const animRot = (1 - eased) * Math.PI * 0.3
            const explode = (explodeAmount ?? 0) * r2_mm * 0.3
            const totalOffset = animOffset + explode
            const ox = Math.cos(bladeAngle) * totalOffset
            const oy = Math.sin(bladeAngle) * totalOffset
            return (
              <group key={i} position={[ox, oy, 0]} rotation={[0, 0, animRot]}>
                <BladeSurfaceMesh surface={surf} idx={i} showColormap={showColormap}
                  showLoadingMap={showLoadingMap}
                  showSpanColors={showSpanColors}
                  showWireframe={showWireframe}
                  showCFDMesh={showCFDMesh}
                  loadingField={loadingData?.blade_loading?.[i] ?? null}
                  onSelect={onSelectBlade} isSelected={selectedBlade === i}
                  selectedBlade={selectedBlade} sizing={sizing} />
                <BladeEdgeLines surface={surf} visible={showEdges ?? true} />
                {/* Hub-blade fillet: rendered only for first 2 blades for performance */}
                {i < 2 && <BladeFilletMesh surface={surf} />}
                {showCFDMesh && (
                  <CFDMeshLines surface={surf} scale={1} meshDensity={meshDensity} />
                )}
                {showCFDMesh && (i === 0 || i === 1) && (
                  <BladeBoundaryLayer surface={surf} scale={1} />
                )}
                {i === 0 && showVelocityArrows && (
                  <VelocityArrows surface={surf} scale={1} sizing={sizing} />
                )}
                {i === 0 && showSections && (
                  <SpanSectionLines surface={surf} scale={1} />
                )}
              </group>
            )
          })}
          {showSplitters && data.splitter_surfaces?.map((surf, i) => (
            <SplitterSurfaceMesh key={`spl_${i}`} surface={surf} showColormap={showColormap} />
          ))}
          {/* Blade numbering labels */}
          {showBladeNumbers && data.blade_surfaces.map((surf, i) => {
            const midSpan = Math.floor(surf.ps.length / 2)
            const midChord = Math.floor(surf.ps[0].length / 2)
            const p = surf.ps[midSpan][midChord]
            return (
              <Html key={`label-${i}`} position={[p.x, p.y, p.z]}
                style={{ pointerEvents: 'none' }}>
                <div style={{
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  borderRadius: '50%', width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                }}>
                  {i + 1}
                </div>
              </Html>
            )
          })}
          {/* Meridional streamlines (hub + shroud profiles) */}
          {showMeridionalLines && (
            <MeridionalLines hubProfile={data.hub_profile} shroudProfile={data.shroud_profile} scale={1} />
          )}
          {/* CFD mesh grid lines on hub and shroud */}
          {showCFDMesh && (
            <HubShroudMeshLines hubProfile={data.hub_profile} shroudProfile={data.shroud_profile} scale={1} meshDensity={meshDensity} />
          )}
          {/* CFD domain inlet/outlet faces */}
          {showCFDMesh && (
            <CFDDomainFaces data={data} scale={1} />
          )}
          {/* Periodic boundary lines (between blade 0 PS and blade 1 SS) */}
          {showCFDMesh && data.blade_surfaces.length >= 2 && (
            <PeriodicBoundaryLines blade0={data.blade_surfaces[0]} blade1={data.blade_surfaces[1]} scale={1} />
          )}
        </group>
      </RotatingGroup>
      </group>

      {/* Section fill plane at Y=0 for meridional cut */}
      {meridionalCut && (
        <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial color="#3a4050" side={THREE.DoubleSide} metalness={0.1} roughness={0.8} />
        </mesh>
      )}

      {showVolute && (
        <group scale={[scale, scale, scale]}>
          <VoluteMesh d2Mm={data.d2 * 1000} />
        </group>
      )}

      <ParticleSystem data={data} active={showParticles && !showStreamlines} paused={paused} />

      {showStreamlines && (
        <group scale={[scale, scale, scale]}>
          <FlowStreamlines data={data} scale={1} active={showStreamlines ?? false} />
        </group>
      )}

      {/* Dimension annotations */}
      {showDimensions && (
        <group scale={[scale, scale, scale]}>
          <Html position={[r2, 0, 0]} center distanceFactor={8}>
            <div style={dimLabelStyle}>D2={d2mm}mm</div>
          </Html>
          {d1mm && (
            <Html position={[r1, 0, z_eye]} center distanceFactor={8}>
              <div style={dimLabelStyle}>D1={d1mm}mm</div>
            </Html>
          )}
          {b2mm && (
            <Html position={[r2 * 0.85, 0, -r2 * 0.15]} center distanceFactor={8}>
              <div style={dimLabelStyle}>b2={b2mm}mm</div>
            </Html>
          )}
          {data.actual_wrap_angle != null && (
            <Html position={[r2 * 0.5, r2 * 0.5, 0]} center distanceFactor={8}>
              <div style={dimLabelStyle}>Wrap={data.actual_wrap_angle.toFixed(0)}&deg;</div>
            </Html>
          )}
          <Html position={[0, 0, z_eye * 0.5]} center distanceFactor={8}>
            <div style={dimLabelStyle}>Z={data.blade_count}</div>
          </Html>
        </group>
      )}

      {/* Interactive measurement line */}
      {measureMode && measurePoints && measurePoints.length === 2 && (() => {
        const p1 = measurePoints[0], p2 = measurePoints[1]
        const dist = Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2 + (p1.z-p2.z)**2)
        // Convert back from scale to mm
        const distMm = dist / scale
        const mid = { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2, z: (p1.z+p2.z)/2 }
        const pts = new Float32Array([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z])
        const lineGeo = new THREE.BufferGeometry()
        lineGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
        return (
          <group>
            <primitive object={new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffff00', linewidth: 2 }))} />
            <Html position={[mid.x, mid.y, mid.z]} center>
              <div style={{
                background: 'rgba(255,255,0,0.9)', color: '#000', padding: '2px 8px',
                borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>{distMm.toFixed(1)} mm</div>
            </Html>
            {/* Point markers */}
            <mesh position={[p1.x, p1.y, p1.z]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshBasicMaterial color="#ff0" />
            </mesh>
            <mesh position={[p2.x, p2.y, p2.z]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshBasicMaterial color="#ff0" />
            </mesh>
          </group>
        )
      })()}

      {/* Measure click handler: invisible sphere covering scene for click capture */}
      {measureMode && (
        <mesh visible={false}
          onClick={(e) => { e.stopPropagation(); if (onMeasureClick) onMeasureClick({x: e.point.x, y: e.point.y, z: e.point.z}) }}>
          <sphereGeometry args={[5, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Floor grid */}
      {/* Fix 6: Light grid for CAD-style background */}
      <gridHelper args={[6, 24, '#2a3545', '#222838']} position={[0, 0, -2.2]} rotation={[Math.PI / 2, 0, 0]} />
    </>
  )
}

// ─── Passage cross-section area chart ────────────────────────────────────────

function PassageAreaChart({ data }: { data: ImpellerData }) {
  const stations = useMemo(() => {
    const hub = data.hub_profile
    const shr = data.shroud_profile
    const Z = data.blade_count
    if (!hub?.length || !shr?.length) return []

    const n = Math.min(hub.length, shr.length)
    const step = Math.max(1, Math.floor(n / 20))
    const result: { m: number; A: number; b: number }[] = []

    for (let i = 0; i < n; i += step) {
      const r_h = hub[i].x, z_h = hub[i].z
      const r_s = shr[i].x, z_s = shr[i].z
      const b = Math.sqrt((r_s - r_h) ** 2 + (z_s - z_h) ** 2) // passage width mm
      const r_mid = (r_h + r_s) / 2
      const A = 2 * Math.PI * r_mid * b / Z // area per passage mm^2
      result.push({ m: i / (n - 1), A, b })
    }
    return result
  }, [data])

  if (stations.length < 2) return null

  const maxA = Math.max(...stations.map(s => s.A))
  const W = 200, H = 120, pad = 25
  const plotW = W - pad * 2, plotH = H - pad * 2

  const points = stations.map((s, i) => {
    const x = pad + s.m * plotW
    const y = H - pad - (s.A / (maxA || 1)) * plotH
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16,
      background: 'rgba(10,15,20,0.88)', borderRadius: 8,
      border: '1px solid rgba(0,160,223,0.3)',
      padding: 8, zIndex: 10, backdropFilter: 'blur(8px)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
        Area da Passagem (mm2)
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={pad} y1={H - pad - f * plotH} x2={W - pad} y2={H - pad - f * plotH}
            stroke="#333" strokeWidth={0.5} />
        ))}
        {/* Axes */}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#556" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#556" strokeWidth={1} />
        {/* Area curve */}
        <path d={points} fill="none" stroke="#00a0df" strokeWidth={2} />
        {/* Fill area */}
        <path d={`${points} L${(W - pad).toFixed(1)},${(H - pad).toFixed(1)} L${pad},${(H - pad).toFixed(1)} Z`}
          fill="rgba(0,160,223,0.1)" />
        {/* Labels */}
        <text x={W / 2} y={H - 3} textAnchor="middle" fill="#888" fontSize={8}>Inlet → Outlet</text>
        <text x={5} y={H / 2} textAnchor="middle" fill="#888" fontSize={8}
          transform={`rotate(-90, 5, ${H / 2})`}>A</text>
        <text x={W - pad} y={H - pad + 10} textAnchor="end" fill="#666" fontSize={7}>
          max {(maxA / 100).toFixed(0)} cm2
        </text>
      </svg>
    </div>
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
  const [displayMode, setDisplayMode] = useState<DisplayMode>('semiaberto')
  const [clipZ, setClipZ] = useState<number | null>(null)
  const [meridionalCut, setMeridionalCut] = useState(false)
  const [showColormap, setShowColormap] = useState(false)
  const [showLoadingMap, setShowLoadingMap] = useState(false)
  const [loadingData, setLoadingData] = useState<BladeLoadingData | null>(null)
  const [showParticles, setShowParticles] = useState(false)
  const [showVolute, setShowVolute] = useState(false)
  const [selectedBlade, setSelectedBlade] = useState<number | null>(null)
  const [resolution, setResolution] = useState<string>(() => {
    // Auto-detect: use 'medium' on mobile/weak GPU, 'high' on desktop
    const isMobile = window.innerWidth < 768
    const isWeakGPU = navigator.hardwareConcurrency < 4
    if (isMobile || isWeakGPU) return 'medium'
    return 'high'
  })
  // TODO: Future improvement — temporarily reduce rendering quality while
  // the user is orbiting (dragging). Approach: listen to OrbitControls
  // 'start'/'end' events, set a transient low-res flag, and restore after
  // a short debounce when dragging stops.
  const [showDimensions, setShowDimensions] = useState(false)
  const [showGhostOverlay, setShowGhostOverlay] = useState(false)
  const [cameraPos, setCameraPos] = useState<[number, number, number]>([3.0, 2.5, 2.5])
  const [showEdges, setShowEdges] = useState(true)
  const [explodeAmount, setExplodeAmount] = useState(0)
  const [showVelocityArrows, setShowVelocityArrows] = useState(false)
  const [showSections, setShowSections] = useState(false)
  const [turntable, setTurntable] = useState(false)
  const [showWireframe, setShowWireframe] = useState(false)
  const [showBladeNumbers, setShowBladeNumbers] = useState(false)
  const [showSpanColors, setShowSpanColors] = useState(false)
  const [showMeridionalLines, setShowMeridionalLines] = useState(false)
  const [showCFDMesh, setShowCFDMesh] = useState(false)
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('medio')
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<{x:number,y:number,z:number}[]>([])
  const [showPassageArea, setShowPassageArea] = useState(false)
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [printScale, setPrintScale] = useState(100)
  const [showStreamlines, setShowStreamlines] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [freeClipAngle, setFreeClipAngle] = useState<number | null>(null)
  const [componentExplode, setComponentExplode] = useState(0)

  // Floating form state
  const [fQ, setFQ] = useState(String(flowRate))
  const [fH, setFH] = useState(String(head))
  const [fN, setFN] = useState(String(rpm))

  useEffect(() => { setFQ(String(flowRate)); setFH(String(head)); setFN(String(rpm)) }, [flowRate, head, rpm])

  // Escape exits presentation mode
  useEffect(() => {
    if (!presentationMode) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPresentationMode(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [presentationMode])

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

  const handleScreenshot = () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    if (!canvas) return
    const temp = document.createElement('canvas')
    temp.width = canvas.width; temp.height = canvas.height
    const ctx = temp.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    // Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = 'bold 13px Inter, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('HPE \u2014 HIGRA Pump Engine', temp.width - 16, temp.height - 30)
    ctx.font = '10px Inter, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    const info = data ? `D2=${(data.d2*1000).toFixed(0)}mm \u00B7 Z=${data.blade_count} pas` : ''
    ctx.fillText(info, temp.width - 16, temp.height - 14)
    const link = document.createElement('a')
    link.download = `hpe-rotor-${Date.now()}.png`
    link.href = temp.toDataURL('image/png')
    link.click()
  }

  const isLoading = loading || parentLoading

  const canvasEl = isLoading ? (
    <LoadingOverlay />
  ) : error ? (
    <ErrorOverlay msg={`${t.failed3d}: ${error}`} />
  ) : data ? (
    <Canvas shadows gl={{ antialias: true, toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true }} style={{ width: '100%', height: '100%', background: 'radial-gradient(ellipse at 40% 40%, #2e3548 0%, #181d28 70%)' }}
      onDoubleClick={() => setCameraPos([3.0, 2.5, 2.5])}>
      <Scene data={data} paused={paused} rpm={rpm} showSplitters={showSplitters} clipZ={clipZ} meridionalCut={meridionalCut} freeClipAngle={freeClipAngle} showColormap={showColormap} showLoadingMap={showLoadingMap} showSpanColors={showSpanColors} showWireframe={showWireframe} showCFDMesh={showCFDMesh} showBladeNumbers={showBladeNumbers} showMeridionalLines={showMeridionalLines} loadingData={loadingData} showParticles={showParticles} showStreamlines={showStreamlines} showVolute={showVolute} displayMode={displayMode} selectedBlade={selectedBlade} onSelectBlade={setSelectedBlade} showDimensions={showDimensions} cameraPos={cameraPos} showEdges={showEdges} explodeAmount={explodeAmount / 100} componentExplode={componentExplode} showVelocityArrows={showVelocityArrows} showSections={showSections} turntable={turntable} sizing={sizing} meshDensity={meshDensity} measureMode={measureMode} measurePoints={measurePoints} onMeasureClick={(pt: {x:number,y:number,z:number}) => setMeasurePoints((prev: {x:number,y:number,z:number}[]) => prev.length >= 2 ? [pt] : [...prev, pt])} />
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
          {!showColormap && !showLoadingMap && !showSpanColors && !showCFDMesh && (
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
          {showSpanColors && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Hub</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #2563eb, #e0e0e0, #dc2626)' }} />
              <span>Shroud</span>
            </div>
          )}
          {showCFDMesh && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Baixa Q</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #cc8800, #66aa22, #00cc66)' }} />
              <span>Alta Q</span>
              <LegendItem color="#00cc88" label="Malha pa" />
              <LegendItem color="#00aacc" label="Malha cubo/shroud" />
              <LegendItem color="#ffaa00" label="Camada limite" />
              <LegendItem color="#0088ff" label="Inlet" />
              <LegendItem color="#ff4400" label="Outlet" />
              <LegendItem color="#ffdd00" label="Periodico" />
            </div>
          )}
        </div>
        {/* TODO: Add ViewCube (rotation helper cube) similar to Fusion 360 */}
        <div style={{ height: 440, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'radial-gradient(ellipse at 40% 40%, #2e3548 0%, #181d28 70%)', position: 'relative' }}
          onDoubleClick={() => setCameraPos([3.0, 2.5, 2.5])}>
          {canvasEl}
          {data && selectedBlade !== null && (
            <BladeInfoPanel
              bladeIdx={selectedBlade}
              bladeCount={data.blade_count}
              sizing={sizing}
              onClose={() => setSelectedBlade(null)}
            />
          )}
          {showCFDMesh && data && (
            <CFDInfoPanel data={data} meshDensity={meshDensity} rpm={rpm} flowRate={flowRate} head={head} />
          )}
          {showGhostOverlay && (
            <div style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(10,15,20,0.85)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6,
              padding: '6px 14px', fontSize: 11, color: '#f59e0b',
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              Sobreposicao 3D disponivel em versao futura
            </div>
          )}
          {/* Passage area chart overlay */}
          {showPassageArea && data && !showCFDMesh && (
            <PassageAreaChart data={data} />
          )}
          {/* Measure mode cursor indicator */}
          {measureMode && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(255,255,0,0.9)', color: '#000', padding: '3px 12px',
              borderRadius: 4, fontSize: 11, fontWeight: 600, pointerEvents: 'none', zIndex: 20,
            }}>
              Modo Medir: clique em 2 pontos na geometria
            </div>
          )}
        </div>
        {/* 3D Print Dialog Modal */}
        {showPrintDialog && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowPrintDialog(false)}>
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
              borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 400,
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--accent)' }}>
                Exportar STL para Impressao 3D
              </h3>
              <label style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Escala (%)</span>
                <input type="number" className="input" value={printScale} min={1} max={1000} step={1}
                  onChange={e => setPrintScale(parseInt(e.target.value) || 100)}
                  style={{ width: '100%', padding: '6px 8px' }} />
              </label>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Para impressao 3D, importe o STL no fatiador (Cura/PrusaSlicer) e configure espessura de parede.
                {printScale !== 100 && (
                  <span style={{ display: 'block', marginTop: 4, color: '#f59e0b' }}>
                    Escala {printScale}%: D2 real {((data?.d2 ?? 0) * 1000).toFixed(0)}mm → impresso {((data?.d2 ?? 0) * 1000 * printScale / 100).toFixed(0)}mm
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowPrintDialog(false)}
                  style={{ flex: 1, padding: '8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={() => {
                  handleExport('stl')
                  setShowPrintDialog(false)
                }}
                  className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: 12 }}>
                  Exportar STL ({printScale}%)
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Controls organized in rows by category */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Row 1: Play + Colormaps + Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <ControlButton label={paused ? '▶' : '⏸'} onClick={() => { if (!turntable) setPaused(p => !p) }} />
            <ControlButton label={turntable ? '◉ Turntable' : '○ Turntable'} onClick={() => setTurntable(t => !t)} />
            <span style={{ width: 1, height: 16, background: 'var(--border-primary)' }} />
            <ControlButton label={showColormap ? '◉ Pressão' : '○ Pressão'} onClick={() => { setShowColormap(c => !c); setShowLoadingMap(false); setShowSpanColors(false); setShowCFDMesh(false) }} />
            <ControlButton label={showLoadingMap ? '◉ rVθ' : '○ rVθ'} onClick={() => { setShowLoadingMap(l => !l); setShowColormap(false); setShowSpanColors(false); setShowCFDMesh(false) }} />
            <ControlButton label={showSpanColors ? '◉ Span' : '○ Span'} onClick={() => { setShowSpanColors(s => !s); setShowColormap(false); setShowLoadingMap(false); setShowCFDMesh(false) }} />
            <ControlButton label={showCFDMesh ? '◉ Malha CFD' : '○ Malha CFD'} onClick={() => { setShowCFDMesh(m => !m); setShowColormap(false); setShowLoadingMap(false); setShowSpanColors(false) }} />
            {showCFDMesh && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Refinamento</span>
                {(['grosso', 'medio', 'fino'] as MeshDensity[]).map(d => (
                  <button key={d} onClick={() => setMeshDensity(d)} style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${meshDensity === d ? 'var(--accent)' : 'var(--border-primary)'}`,
                    background: meshDensity === d ? 'rgba(0,160,223,0.2)' : 'transparent',
                    color: meshDensity === d ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: meshDensity === d ? 600 : 400,
                  }}>{d.charAt(0).toUpperCase() + d.slice(1)}</button>
                ))}
              </div>
            )}
            <span style={{ width: 1, height: 16, background: 'var(--border-primary)' }} />
            <ControlButton label={showEdges ? '◉ Arestas' : '○ Arestas'} onClick={() => setShowEdges(e => !e)} />
            <ControlButton label={showWireframe ? '◉ Wire' : '○ Wire'} onClick={() => setShowWireframe(w => !w)} />
            <ControlButton label={showBladeNumbers ? '◉ Nº' : '○ Nº'} onClick={() => setShowBladeNumbers(b => !b)} />
            <ControlButton label={showDimensions ? '◉ Cotas' : '○ Cotas'} onClick={() => setShowDimensions(d => !d)} />
          </div>
          {/* Row 2: Geometry + Cortes + Vistas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <DisplayModeButtons displayMode={displayMode} setDisplayMode={setDisplayMode} />
            <ControlButton label={showParticles ? '◉ Partículas' : '○ Partículas'} onClick={() => { setShowParticles(p => !p); setShowStreamlines(false) }} />
            <ControlButton label={showStreamlines ? '◉ Fluxo' : '○ Fluxo'} onClick={() => { setShowStreamlines(s => !s); setShowParticles(false) }} />
            <ControlButton label={showVolute ? '◉ Voluta' : '○ Voluta'} onClick={() => setShowVolute(v => !v)} />
            <ControlButton label={showMeridionalLines ? '◉ Merid.' : '○ Merid.'} onClick={() => setShowMeridionalLines(m => !m)} />
            <ControlButton label={showVelocityArrows ? '◉ Vel.' : '○ Vel.'} onClick={() => setShowVelocityArrows(v => !v)} />
            <ControlButton label={showSections ? '◉ Seções' : '○ Seções'} onClick={() => setShowSections(s => !s)} />
            <ControlButton label={meridionalCut ? '◉ Corte M' : '○ Corte M'} onClick={() => setMeridionalCut(v => !v)} />
            <ControlButton label={measureMode ? '◉ Medir' : '○ Medir'} onClick={() => { setMeasureMode(m => !m); setMeasurePoints([]) }} />
            <ControlButton label={showPassageArea ? '◉ Area' : '○ Area'} onClick={() => setShowPassageArea(a => !a)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Explosão</span>
              <input type="range" min={0} max={100} step={1} value={explodeAmount}
                onChange={e => setExplodeAmount(parseFloat(e.target.value))}
                style={{ width: 50, accentColor: 'var(--accent)' }} />
            </div>
            {displayMode === 'fechado' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Componentes</span>
                <input type="range" min={0} max={100} step={1} value={componentExplode}
                  onChange={e => setComponentExplode(parseFloat(e.target.value))}
                  style={{ width: 50, accentColor: 'var(--accent)' }} />
              </div>
            )}
            {clipZ === null && !meridionalCut && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Corte Livre</span>
                <input type="range" min={0} max={360} step={1} value={freeClipAngle ?? 0}
                  onChange={e => setFreeClipAngle(freeClipAngle === null ? null : parseFloat(e.target.value))}
                  style={{ width: 50, accentColor: '#f59e0b' }} />
                <button
                  onClick={() => setFreeClipAngle(c => c === null ? 0 : null)}
                  style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${freeClipAngle !== null ? '#f59e0b' : 'var(--border-primary)'}`,
                    background: freeClipAngle !== null ? 'rgba(245,158,11,0.15)' : 'transparent',
                    color: freeClipAngle !== null ? '#f59e0b' : 'var(--text-muted)',
                  }}
                >{freeClipAngle !== null ? 'ON' : 'OFF'}</button>
              </div>
            )}
            <span style={{ width: 1, height: 16, background: 'var(--border-primary)' }} />
            <ControlButton label="Front" onClick={() => setCameraPos([0, 0, 5])} />
            <ControlButton label="Lat" onClick={() => setCameraPos([5, 0, 0])} />
            <ControlButton label="Top" onClick={() => setCameraPos([0, 5, 0])} />
            <ControlButton label="Iso" onClick={() => setCameraPos([2.5, 1.8, 3.5])} />
            <ControlButton label="PNG" onClick={handleScreenshot} />
          </div>
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
          <button onClick={() => handleExport('step')}
            className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>STEP</button>
          <button onClick={() => handleExport('stl')}
            className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>STL</button>
          <button onClick={() => setShowPrintDialog(true)}
            className="btn-primary" style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.4)', color: '#a78bfa' }}>
            STL (3D Print)
          </button>
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
      <div style={{ width: '100%', height: '100%', background: 'radial-gradient(ellipse at 40% 40%, #2e3548 0%, #181d28 70%)', position: 'relative' }}
        onDoubleClick={() => setCameraPos([3.0, 2.5, 2.5])}>
        {canvasEl}
        {showGhostOverlay && (
          <div style={{
            position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,15,20,0.85)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6,
            padding: '6px 14px', fontSize: 11, color: '#f59e0b',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            Sobreposicao 3D disponivel em versao futura
          </div>
        )}
        {/* Passage area chart overlay (fullscreen) */}
        {showPassageArea && data && !showCFDMesh && (
          <div style={{ position: 'absolute', bottom: 60, left: 16 }}>
            <PassageAreaChart data={data} />
          </div>
        )}
        {/* Measure mode indicator (fullscreen) */}
        {measureMode && (
          <div style={{
            position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(255,255,0,0.9)', color: '#000', padding: '3px 12px',
            borderRadius: 4, fontSize: 11, fontWeight: 600, pointerEvents: 'none', zIndex: 20,
          }}>
            Modo Medir: clique em 2 pontos na geometria
          </div>
        )}
      </div>

      {/* 3D Print Dialog Modal (fullscreen) */}
      {showPrintDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowPrintDialog(false)}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
            borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 400,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--accent)' }}>
              Exportar STL para Impressao 3D
            </h3>
            <label style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Escala (%)</span>
              <input type="number" className="input" value={printScale} min={1} max={1000} step={1}
                onChange={e => setPrintScale(parseInt(e.target.value) || 100)}
                style={{ width: '100%', padding: '6px 8px' }} />
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Para impressao 3D, importe o STL no fatiador (Cura/PrusaSlicer) e configure espessura de parede.
              {printScale !== 100 && (
                <span style={{ display: 'block', marginTop: 4, color: '#f59e0b' }}>
                  Escala {printScale}%: D2 real {((data?.d2 ?? 0) * 1000).toFixed(0)}mm → impresso {((data?.d2 ?? 0) * 1000 * printScale / 100).toFixed(0)}mm
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowPrintDialog(false)}
                style={{ flex: 1, padding: '8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => {
                handleExport('stl')
                setShowPrintDialog(false)
              }}
                className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: 12 }}>
                Exportar STL ({printScale}%)
              </button>
            </div>
          </div>
        </div>
      )}

      {data && selectedBlade !== null && (
        <BladeInfoPanel
          bladeIdx={selectedBlade}
          bladeCount={data.blade_count}
          sizing={sizing}
          onClose={() => setSelectedBlade(null)}
        />
      )}

      {showCFDMesh && data && (
        <CFDInfoPanel data={data} meshDensity={meshDensity} rpm={rpm} flowRate={flowRate} head={head} />
      )}

      {/* TOP-LEFT: Legend bar */}
      <div className="viewer-overlay viewer-overlay-tl">
        <div className="glass-panel" style={{ padding: '7px 14px', display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>HPE</span>
          {!showColormap && !showLoadingMap && !showSpanColors && !showCFDMesh && (
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
          {showSpanColors && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Hub</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #2563eb, #e0e0e0, #dc2626)' }} />
              <span>Shroud</span>
            </div>
          )}
          {showCFDMesh && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Baixa Q</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #cc8800, #66aa22, #00cc66)' }} />
              <span>Alta Q</span>
              <LegendItem color="#00cc88" label="Malha pa" />
              <LegendItem color="#00aacc" label="Malha cubo/shroud" />
              <LegendItem color="#ffaa00" label="Camada limite" />
              <LegendItem color="#0088ff" label="Inlet" />
              <LegendItem color="#ff4400" label="Outlet" />
              <LegendItem color="#ffdd00" label="Periodico" />
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
        <div className="glass-panel" style={{ padding: '7px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 700 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.dragToRotate}</span>
          <ControlButton label={paused ? '▶ Girar' : '⏸ Pausar'} onClick={() => { if (!turntable) setPaused(p => !p) }} />
          <ControlButton label={showColormap ? 'Mapa P ON' : 'Mapa P'} onClick={() => { setShowColormap(c => !c); setShowLoadingMap(false); setShowSpanColors(false); setShowCFDMesh(false) }} />
          <ControlButton label={showLoadingMap ? 'Mapa rVθ ON' : 'Mapa rVθ'} onClick={() => { setShowLoadingMap(l => !l); setShowColormap(false); setShowSpanColors(false); setShowCFDMesh(false) }} />
          <ControlButton label={showCFDMesh ? '◉ Malha CFD' : '○ Malha CFD'} onClick={() => { setShowCFDMesh(m => !m); setShowColormap(false); setShowLoadingMap(false); setShowSpanColors(false) }} />
          {showCFDMesh && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Refinamento</span>
              {(['grosso', 'medio', 'fino'] as MeshDensity[]).map(d => (
                <button key={d} onClick={() => setMeshDensity(d)} style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${meshDensity === d ? 'var(--accent)' : 'var(--border-primary)'}`,
                  background: meshDensity === d ? 'rgba(0,160,223,0.2)' : 'transparent',
                  color: meshDensity === d ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: meshDensity === d ? 600 : 400,
                }}>{d.charAt(0).toUpperCase() + d.slice(1)}</button>
              ))}
            </div>
          )}
          <ControlButton label={showParticles ? '◉ Particulas' : '○ Particulas'} onClick={() => { setShowParticles(p => !p); setShowStreamlines(false) }} />
          <ControlButton label={showStreamlines ? '◉ Fluxo' : '○ Fluxo'} onClick={() => { setShowStreamlines(s => !s); setShowParticles(false) }} />
          <DisplayModeButtons displayMode={displayMode} setDisplayMode={setDisplayMode} />
          <ControlButton label={showVolute ? '◉ Voluta' : '○ Voluta'} onClick={() => setShowVolute(v => !v)} />
          <ControlButton label={showEdges ? '◉ Arestas' : '○ Arestas'} onClick={() => setShowEdges(e => !e)} />
          <ControlButton label={showWireframe ? '◉ Wireframe' : '○ Wireframe'} onClick={() => setShowWireframe(w => !w)} />
          <ControlButton label={showBladeNumbers ? '◉ N.' : '○ N.'} onClick={() => setShowBladeNumbers(b => !b)} />
          <ControlButton label={showSpanColors ? '◉ Span' : '○ Span'} onClick={() => { setShowSpanColors(s => !s); setShowColormap(false); setShowLoadingMap(false); setShowCFDMesh(false) }} />
          <ControlButton label={showMeridionalLines ? '◉ Meridional' : '○ Meridional'} onClick={() => setShowMeridionalLines(m => !m)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Explosao</span>
            <input type="range" min={0} max={100} step={1} value={explodeAmount}
              onChange={e => setExplodeAmount(parseFloat(e.target.value))}
              style={{ width: 60, accentColor: 'var(--accent)' }} />
          </div>
          {displayMode === 'fechado' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Componentes</span>
              <input type="range" min={0} max={100} step={1} value={componentExplode}
                onChange={e => setComponentExplode(parseFloat(e.target.value))}
                style={{ width: 60, accentColor: 'var(--accent)' }} />
            </div>
          )}

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

          {/* Meridional section cut */}
          <button
            onClick={() => setMeridionalCut(v => !v)}
            style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 3,
              border: `1px solid ${meridionalCut ? '#f59e0b' : 'var(--border-primary)'}`,
              background: meridionalCut ? 'rgba(245,158,11,0.15)' : 'transparent',
              color: meridionalCut ? '#f59e0b' : 'var(--text-muted)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {meridionalCut ? 'Corte Meridional ON' : 'Corte Meridional'}
          </button>

          {/* Free clip plane slider — shown when Corte Z and Corte M are off */}
          {clipZ === null && !meridionalCut && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Corte Livre</span>
              <input type="range" min={0} max={360} step={1} value={freeClipAngle ?? 0}
                onChange={e => setFreeClipAngle(freeClipAngle === null ? null : parseFloat(e.target.value))}
                style={{ width: 60, accentColor: '#f59e0b' }} />
              <button
                onClick={() => setFreeClipAngle(c => c === null ? 0 : null)}
                style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${freeClipAngle !== null ? '#f59e0b' : 'var(--border-primary)'}`,
                  background: freeClipAngle !== null ? 'rgba(245,158,11,0.15)' : 'transparent',
                  color: freeClipAngle !== null ? '#f59e0b' : 'var(--text-muted)',
                }}
              >{freeClipAngle !== null ? 'ON' : 'OFF'}</button>
            </div>
          )}

          <ControlButton label={showDimensions ? 'Cotas ON' : 'Cotas'} onClick={() => setShowDimensions(d => !d)} />
          <ControlButton label={measureMode ? 'Medir ON' : 'Medir'} onClick={() => { setMeasureMode(m => !m); setMeasurePoints([]) }} />
          <ControlButton label={showPassageArea ? 'Area ON' : 'Area'} onClick={() => setShowPassageArea(a => !a)} />
          <ControlButton label={showGhostOverlay ? 'Sobrepor V ON' : 'Sobrepor V anterior'} onClick={() => setShowGhostOverlay(g => !g)} />
          <span style={{ fontSize: 9, color: 'var(--text-muted)', borderLeft: '1px solid var(--border-primary)', paddingLeft: 6 }}>Vistas:</span>
          <ControlButton label="Frontal" onClick={() => setCameraPos([0, 0, 5])} />
          <ControlButton label="Lateral" onClick={() => setCameraPos([5, 0, 0])} />
          <ControlButton label="Topo" onClick={() => setCameraPos([0, 5, 0])} />
          <ControlButton label="Iso" onClick={() => setCameraPos([2.5, 1.8, 3.5])} />

          <ControlButton label={showVelocityArrows ? 'Vel. ON' : 'Vel.'} onClick={() => setShowVelocityArrows(v => !v)} />
          <ControlButton label={showSections ? 'Secoes ON' : 'Secoes'} onClick={() => setShowSections(s => !s)} />
          <ControlButton label={turntable ? 'Turntable ON' : 'Turntable'} onClick={() => setTurntable(t => !t)} />
          <ControlButton label="Apresentar" onClick={() => setPresentationMode(true)} />
          <ControlButton label="PNG" onClick={handleScreenshot} />
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
          <button onClick={() => handleExport('step')}
            className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>STEP</button>
          <button onClick={() => handleExport('stl')}
            className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>STL</button>
          <button onClick={() => setShowPrintDialog(true)}
            className="btn-primary" style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.4)', color: '#a78bfa' }}>
            STL (3D Print)
          </button>
          <button onClick={handleGltfExport} className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>
            glTF
          </button>
        </div>
      </div>

      {/* ── Presentation mode overlay ──────────────────────────────���───── */}
      {presentationMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#0a0e14', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Canvas shadows gl={{ antialias: true, preserveDrawingBuffer: true }}>
              <PerspectiveCamera makeDefault position={[2.5, 1.8, 3.5]} fov={40} />
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
              <directionalLight position={[-3, 4, -2]} intensity={0.3} />
              <OrbitControls autoRotate autoRotateSpeed={1.2} enableDamping dampingFactor={0.05} />
              {data && (
                <group>
                  {Array.from({ length: data.blade_count }).map((_, i) => {
                    const angle = (i / data.blade_count) * Math.PI * 2
                    return (
                      <group key={i} rotation={[0, angle, 0]}>
                        {data.blade_surfaces.map((surf, si) => (
                          <React.Fragment key={si}>
                            <mesh geometry={buildQuadGeo(surf.ps)}>
                              <meshStandardMaterial color="#00A0DF" side={THREE.DoubleSide} metalness={0.3} roughness={0.5} />
                            </mesh>
                            <mesh geometry={buildQuadGeo(surf.ss)}>
                              <meshStandardMaterial color="#00A0DF" side={THREE.DoubleSide} metalness={0.3} roughness={0.5} />
                            </mesh>
                          </React.Fragment>
                        ))}
                      </group>
                    )
                  })}
                </group>
              )}
              <Environment preset="city" />
            </Canvas>
          </div>
          <div style={{ textAlign: 'center', padding: '20px 0', background: 'rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 600 }}>
              {sizing?.impeller_type || 'Projeto HPE'}
            </div>
            <div style={{ fontSize: 14, color: '#00A0DF', marginTop: 6 }}>
              Nq={sizing?.specific_speed_nq?.toFixed(1) ?? '--'}
              {' \u00B7 '}\u03B7={sizing ? (sizing.estimated_efficiency * 100).toFixed(1) : '--'}%
              {' \u00B7 '}D2={sizing ? (sizing.impeller_d2 * 1000).toFixed(0) : '--'}mm
              {' \u00B7 '}{sizing?.blade_count ?? '--'} pas
            </div>
          </div>
          <button onClick={() => setPresentationMode(false)} style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
            fontFamily: 'var(--font-family)',
          }}>ESC para sair</button>
        </div>
      )}
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

// ─── Display mode selector ───────────────────────────────────────────────────

function DisplayModeButtons({ displayMode, setDisplayMode }: {
  displayMode: DisplayMode
  setDisplayMode: (m: DisplayMode) => void
}) {
  const modes: { key: DisplayMode; label: string }[] = [
    { key: 'fechado', label: 'Fechado' },
    { key: 'semiaberto', label: 'Semiaberto' },
    { key: 'aberto', label: 'Aberto' },
  ]
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {modes.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setDisplayMode(key)}
          style={{
            fontSize: 10, padding: '3px 8px', cursor: 'pointer',
            border: '1px solid var(--border-primary)',
            borderRight: key !== 'aberto' ? 'none' : '1px solid var(--border-primary)',
            borderRadius: key === 'fechado' ? '4px 0 0 4px' : key === 'aberto' ? '0 4px 4px 0' : '0',
            background: displayMode === key ? 'rgba(0,160,223,0.2)' : 'transparent',
            color: displayMode === key ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: displayMode === key ? 600 : 400,
          }}
        >
          {label}
        </button>
      ))}
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
