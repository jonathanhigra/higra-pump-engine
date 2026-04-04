/**
 * MeridionalDragEditor — Interactive SVG drag-and-drop editor for
 * hub/shroud meridional curves, inspired by TURBOdesign Suite.
 *
 * Features:
 *   - Draggable Bezier control points for hub and shroud
 *   - Real-time cubic Bezier curve preview
 *   - Template presets (Bomba Radial, Mixed-Flow, Francis, Axial)
 *   - Live dimension readout (D1, D2, b1, b2, axial length)
 *   - Validation via POST /api/v1/meridional/validate_control_points
 *   - "Aplicar ao 3D" sends points to geometry endpoint
 *   - Real-time passage metrics below the canvas
 *   - Full undo/redo history (Ctrl+Z / Ctrl+Y)
 *   - Right-click insert/delete control points
 *   - Numeric editing panel for precise coordinate entry
 *   - Splitter blade LE curve
 *   - LE/TE visual indicators
 *   - Mouse wheel zoom + middle-button pan
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RZPoint {
  r: number
  z: number
}

interface ControlPoints {
  hub: RZPoint[]
  shroud: RZPoint[]
  splitter?: RZPoint[]
}

interface Metrics {
  passage_area_ratio: number
  l_d2: number
  curvature_radius_hub: number
  curvature_radius_shroud: number
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  metrics: Metrics
}

interface TemplateOption {
  value: string
  label: string
}

interface ContextMenuState {
  x: number
  y: number
  type: 'point' | 'curve'
  curveId: 'hub' | 'shroud' | 'splitter'
  pointIndex?: number
}

interface Props {
  /** Initial inlet diameter [mm] */
  d1?: number
  /** Initial outlet diameter [mm] */
  d2?: number
  /** Initial outlet width [mm] */
  b2?: number
  /** Callback when user clicks "Aplicar ao 3D" */
  onApply?: (data: { hub_rz: RZPoint[]; shroud_rz: RZPoint[]; splitter_rz?: RZPoint[] }) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SVG_W = 800
const SVG_H = 500
const PAD = { l: 56, r: 30, t: 24, b: 44 }
const INNER_W = SVG_W - PAD.l - PAD.r
const INNER_H = SVG_H - PAD.t - PAD.b
const CP_RADIUS = 7
const GRID_LINES_X = 8
const GRID_LINES_Y = 6
const MAX_HISTORY = 50

const TEMPLATES: TemplateOption[] = [
  { value: 'radial_pump', label: 'Bomba Radial' },
  { value: 'mixed_flow', label: 'Mixed-Flow' },
  { value: 'francis_turbine', label: 'Francis' },
  { value: 'axial', label: 'Axial' },
]

// ---------------------------------------------------------------------------
// Default control points (radial pump, 6 points each)
// ---------------------------------------------------------------------------

function defaultHubCPs(r2: number, b2: number, d1?: number): RZPoint[] {
  const r1 = d1 != null ? d1 / 2 : r2 * 0.45
  const hubR0 = r1 * 0.45   // hub radius at eye ≈ d1_hub
  const axLen = r2 * 0.3     // axial length ≈ 0.20 * D2 (since r2 = D2/2, 0.3*r2 = 0.15*D2)
  return [
    { r: hubR0, z: axLen },
    { r: hubR0, z: axLen * 0.72 },
    { r: hubR0 + (r2 - hubR0) * 0.25, z: axLen * 0.45 },
    { r: hubR0 + (r2 - hubR0) * 0.55, z: axLen * 0.18 },
    { r: r2 * 0.85, z: 0.001 },
    { r: r2, z: 0 },
  ]
}

function defaultShroudCPs(r2: number, b2: number, d1?: number): RZPoint[] {
  const r1 = d1 != null ? d1 / 2 : r2 * 0.45
  const axLen = r2 * 0.3
  return [
    { r: r1, z: axLen },
    { r: r1, z: axLen * 0.65 },
    { r: r1 + (r2 - r1) * 0.3, z: axLen * 0.38 },
    { r: r1 + (r2 - r1) * 0.6, z: b2 * 2.5 },
    { r: r2 * 0.92, z: b2 * 1.3 },
    { r: r2, z: b2 },
  ]
}

function defaultSplitterCPs(hubCPs: RZPoint[], shrCPs: RZPoint[]): RZPoint[] {
  // Splitter LE starts at ~40% of hub chord and extends to 100%
  const hubLen = hubCPs.length
  const shrLen = shrCPs.length
  const startFrac = 0.4
  const fracs = [startFrac, (startFrac + 1) / 2, 1.0]

  return fracs.map(f => {
    const hIdx = Math.min(Math.floor(f * (hubLen - 1)), hubLen - 1)
    const sIdx = Math.min(Math.floor(f * (shrLen - 1)), shrLen - 1)
    const hPt = hubCPs[hIdx]
    const sPt = shrCPs[sIdx]
    return {
      r: (hPt.r + sPt.r) / 2,
      z: (hPt.z + sPt.z) / 2,
    }
  })
}

// ---------------------------------------------------------------------------
// Cubic Bezier helpers (client-side preview)
// ---------------------------------------------------------------------------

function cubicBezierSegment(
  p0: RZPoint, p1: RZPoint, p2: RZPoint, p3: RZPoint, steps: number,
): RZPoint[] {
  const pts: RZPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    pts.push({
      r: u * u * u * p0.r + 3 * u * u * t * p1.r + 3 * u * t * t * p2.r + t * t * t * p3.r,
      z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
    })
  }
  return pts
}

/** Catmull-Rom to piecewise cubic Bezier — mirrors backend logic. */
function interpolateCurve(cps: RZPoint[], totalSteps = 80): RZPoint[] {
  if (cps.length < 2) return cps
  if (cps.length === 2) {
    const pts: RZPoint[] = []
    for (let i = 0; i <= totalSteps; i++) {
      const t = i / totalSteps
      pts.push({ r: cps[0].r + t * (cps[1].r - cps[0].r), z: cps[0].z + t * (cps[1].z - cps[0].z) })
    }
    return pts
  }
  if (cps.length === 3) {
    const [p0, p1, p2] = cps
    const cp1 = { r: p0.r + (2 / 3) * (p1.r - p0.r), z: p0.z + (2 / 3) * (p1.z - p0.z) }
    const cp2 = { r: p2.r + (2 / 3) * (p1.r - p2.r), z: p2.z + (2 / 3) * (p1.z - p2.z) }
    return cubicBezierSegment(p0, cp1, cp2, p2, totalSteps)
  }
  if (cps.length === 4) {
    return cubicBezierSegment(cps[0], cps[1], cps[2], cps[3], totalSteps)
  }

  // General case: Catmull-Rom -> cubic Bezier segments
  const nSeg = cps.length - 1
  const stepsPerSeg = Math.max(2, Math.floor(totalSteps / nSeg))
  const all: RZPoint[] = []

  for (let i = 0; i < nSeg; i++) {
    const m0r = i === 0 ? cps[1].r - cps[0].r : 0.5 * (cps[i + 1].r - cps[i - 1].r)
    const m0z = i === 0 ? cps[1].z - cps[0].z : 0.5 * (cps[i + 1].z - cps[i - 1].z)
    const m1r = i === nSeg - 1 ? cps[i + 1].r - cps[i].r : 0.5 * (cps[i + 2].r - cps[i].r)
    const m1z = i === nSeg - 1 ? cps[i + 1].z - cps[i].z : 0.5 * (cps[i + 2].z - cps[i].z)

    const bp0 = cps[i]
    const bp1 = { r: cps[i].r + m0r / 3, z: cps[i].z + m0z / 3 }
    const bp2 = { r: cps[i + 1].r - m1r / 3, z: cps[i + 1].z - m1z / 3 }
    const bp3 = cps[i + 1]

    const seg = cubicBezierSegment(bp0, bp1, bp2, bp3, stepsPerSeg)
    // Skip first point of subsequent segments to avoid duplicates
    all.push(...(i === 0 ? seg : seg.slice(1)))
  }
  return all
}

// ---------------------------------------------------------------------------
// Local metrics computation (matches backend for instant feedback)
// ---------------------------------------------------------------------------

function computeLocalMetrics(hubCPs: RZPoint[], shrCPs: RZPoint[]): Metrics {
  const hub = interpolateCurve(hubCPs, 60)
  const shr = interpolateCurve(shrCPs, 60)

  const n = Math.min(hub.length, shr.length)
  const wInlet = Math.sqrt((shr[0].r - hub[0].r) ** 2 + (shr[0].z - hub[0].z) ** 2)
  const wOutlet = Math.sqrt((shr[n - 1].r - hub[n - 1].r) ** 2 + (shr[n - 1].z - hub[n - 1].z) ** 2)
  const passage_area_ratio = wInlet / Math.max(wOutlet, 1e-12)

  const rMax = Math.max(hub[hub.length - 1].r, shr[shr.length - 1].r)
  const d2 = 2 * rMax
  const allZ = [...hub.map(p => p.z), ...shr.map(p => p.z)]
  const axLen = Math.max(...allZ) - Math.min(...allZ)
  const l_d2 = axLen / Math.max(d2, 1e-12)

  function minCurvRadius(pts: RZPoint[]): number {
    if (pts.length < 3) return Infinity
    let maxK = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const dr = (pts[i + 1].r - pts[i - 1].r) / 2
      const dz = (pts[i + 1].z - pts[i - 1].z) / 2
      const d2r = pts[i + 1].r - 2 * pts[i].r + pts[i - 1].r
      const d2z = pts[i + 1].z - 2 * pts[i].z + pts[i - 1].z
      const num = Math.abs(dr * d2z - dz * d2r)
      const den = (dr * dr + dz * dz) ** 1.5
      if (den > 1e-12) maxK = Math.max(maxK, num / den)
    }
    return maxK > 1e-12 ? 1 / maxK : Infinity
  }

  return {
    passage_area_ratio: Math.round(passage_area_ratio * 1e4) / 1e4,
    l_d2: Math.round(l_d2 * 1e4) / 1e4,
    curvature_radius_hub: minCurvRadius(hub),
    curvature_radius_shroud: minCurvRadius(shr),
  }
}

// ---------------------------------------------------------------------------
// Dimension computation from control points
// ---------------------------------------------------------------------------

function computeDimensions(hubCPs: RZPoint[], shrCPs: RZPoint[]) {
  const hub = interpolateCurve(hubCPs, 40)
  const shr = interpolateCurve(shrCPs, 40)

  const rOutHub = hub[hub.length - 1].r
  const rOutShr = shr[shr.length - 1].r
  const d2 = 2 * Math.max(rOutHub, rOutShr)

  const rInHub = hub[0].r
  const rInShr = shr[0].r
  const d1 = 2 * Math.max(rInHub, rInShr)

  const b1 = Math.sqrt((shr[0].r - hub[0].r) ** 2 + (shr[0].z - hub[0].z) ** 2)
  const n = Math.min(hub.length, shr.length)
  const b2 = Math.sqrt((shr[n - 1].r - hub[n - 1].r) ** 2 + (shr[n - 1].z - hub[n - 1].z) ** 2)

  const allZ = [...hub.map(p => p.z), ...shr.map(p => p.z)]
  const axialLength = Math.max(...allZ) - Math.min(...allZ)

  return { d1, d2, b1, b2, axialLength }
}

// ---------------------------------------------------------------------------
// Deep clone helper
// ---------------------------------------------------------------------------

function clonePoints(pts: RZPoint[]): RZPoint[] {
  return pts.map(p => ({ r: p.r, z: p.z }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MeridionalDragEditor({
  d1: initD1,
  d2: initD2 = 0.3,
  b2: initB2 = 0.02,
  onApply,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Control points state — use d1 from sizing if available
  const [hubCPs, setHubCPs] = useState<RZPoint[]>(() => defaultHubCPs(initD2 / 2, initB2, initD1))
  const [shrCPs, setShrCPs] = useState<RZPoint[]>(() => defaultShroudCPs(initD2 / 2, initB2, initD1))
  const [splitterCPs, setSplitterCPs] = useState<RZPoint[]>(() =>
    defaultSplitterCPs(defaultHubCPs(initD2 / 2, initB2, initD1), defaultShroudCPs(initD2 / 2, initB2, initD1)),
  )
  const [initialHub, setInitialHub] = useState<RZPoint[]>(() => defaultHubCPs(initD2 / 2, initB2, initD1))
  const [initialShr, setInitialShr] = useState<RZPoint[]>(() => defaultShroudCPs(initD2 / 2, initB2, initD1))

  // Interaction state
  const [dragging, setDragging] = useState<{ curve: 'hub' | 'shr' | 'splitter'; idx: number } | null>(null)
  const [hovering, setHovering] = useState<{ curve: 'hub' | 'shr' | 'splitter'; idx: number } | null>(null)

  // Template & validation
  const [selectedTemplate, setSelectedTemplate] = useState<string>('radial_pump')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  // Gap 1: Undo/Redo history
  const [history, setHistory] = useState<{ past: ControlPoints[]; future: ControlPoints[] }>({
    past: [],
    future: [],
  })

  // Gap 2: Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Gap 3: Numeric panel - focused point highlight
  const [focusedPoint, setFocusedPoint] = useState<{ curve: 'hub' | 'shroud' | 'splitter'; idx: number } | null>(null)
  const numericDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Gap 4: Splitter toggle
  const [showSplitter, setShowSplitter] = useState(false)

  // Gap 6: Zoom/Pan
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: SVG_W, height: SVG_H })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; vbx: number; vby: number } | null>(null)

  const zoomLevel = useMemo(() => Math.round((SVG_W / viewBox.width) * 100), [viewBox.width])

  // -----------------------------------------------------------------------
  // Gap 1: Undo/Redo helpers
  // -----------------------------------------------------------------------

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
      const snapshot: ControlPoints = {
        hub: clonePoints(hubCPs),
        shroud: clonePoints(shrCPs),
        splitter: clonePoints(splitterCPs),
      }
      const newPast = [...prev.past, snapshot]
      if (newPast.length > MAX_HISTORY) newPast.shift()
      return { past: newPast, future: [] }
    })
  }, [hubCPs, shrCPs, splitterCPs])

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev
      const newPast = [...prev.past]
      const restored = newPast.pop()!
      const currentSnapshot: ControlPoints = {
        hub: clonePoints(hubCPs),
        shroud: clonePoints(shrCPs),
        splitter: clonePoints(splitterCPs),
      }
      setHubCPs(restored.hub)
      setShrCPs(restored.shroud)
      if (restored.splitter) setSplitterCPs(restored.splitter)
      return { past: newPast, future: [currentSnapshot, ...prev.future] }
    })
  }, [hubCPs, shrCPs, splitterCPs])

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev
      const newFuture = [...prev.future]
      const restored = newFuture.shift()!
      const currentSnapshot: ControlPoints = {
        hub: clonePoints(hubCPs),
        shroud: clonePoints(shrCPs),
        splitter: clonePoints(splitterCPs),
      }
      setHubCPs(restored.hub)
      setShrCPs(restored.shroud)
      if (restored.splitter) setSplitterCPs(restored.splitter)
      return { past: [...prev.past, currentSnapshot], future: newFuture }
    })
  }, [hubCPs, shrCPs, splitterCPs])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (e.key === 'Escape') {
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // -----------------------------------------------------------------------
  // Coordinate mapping
  // -----------------------------------------------------------------------

  const { rMin, rMax, zMin, zMax } = useMemo(() => {
    const allR = [...hubCPs.map(p => p.r), ...shrCPs.map(p => p.r)]
    const allZ = [...hubCPs.map(p => p.z), ...shrCPs.map(p => p.z)]
    if (showSplitter) {
      allR.push(...splitterCPs.map(p => p.r))
      allZ.push(...splitterCPs.map(p => p.z))
    }
    const rm = Math.min(...allR)
    const rM = Math.max(...allR)
    const zm = Math.min(...allZ)
    const zM = Math.max(...allZ)
    const rSpan = rM - rm || 0.01
    const zSpan = zM - zm || 0.01
    return {
      rMin: rm - rSpan * 0.1,
      rMax: rM + rSpan * 0.1,
      zMin: zm - zSpan * 0.1,
      zMax: zM + zSpan * 0.1,
    }
  }, [hubCPs, shrCPs, splitterCPs, showSplitter])

  /** Physical (r, z) -> SVG (x, y).  z is horizontal, r is vertical (inverted). */
  const toSVG = useCallback(
    (p: RZPoint) => ({
      x: PAD.l + ((p.z - zMin) / (zMax - zMin)) * INNER_W,
      y: PAD.t + (1 - (p.r - rMin) / (rMax - rMin)) * INNER_H,
    }),
    [rMin, rMax, zMin, zMax],
  )

  /** SVG (x, y) -> Physical (r, z). */
  const fromSVG = useCallback(
    (sx: number, sy: number): RZPoint => ({
      z: zMin + ((sx - PAD.l) / INNER_W) * (zMax - zMin),
      r: rMin + (1 - (sy - PAD.t) / INNER_H) * (rMax - rMin),
    }),
    [rMin, rMax, zMin, zMax],
  )

  // -----------------------------------------------------------------------
  // Interpolated curves for display
  // -----------------------------------------------------------------------

  const hubCurve = useMemo(() => interpolateCurve(hubCPs, 80), [hubCPs])
  const shrCurve = useMemo(() => interpolateCurve(shrCPs, 80), [shrCPs])
  const splitterCurve = useMemo(() => showSplitter ? interpolateCurve(splitterCPs, 40) : [], [splitterCPs, showSplitter])

  const hubPath = useMemo(() => {
    return hubCurve.map((p, i) => {
      const s = toSVG(p)
      return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`
    }).join(' ')
  }, [hubCurve, toSVG])

  const shrPath = useMemo(() => {
    return shrCurve.map((p, i) => {
      const s = toSVG(p)
      return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`
    }).join(' ')
  }, [shrCurve, toSVG])

  const splitterPath = useMemo(() => {
    if (!showSplitter || splitterCurve.length === 0) return ''
    return splitterCurve.map((p, i) => {
      const s = toSVG(p)
      return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`
    }).join(' ')
  }, [splitterCurve, toSVG, showSplitter])

  /** Passage fill polygon */
  const passagePath = useMemo(() => {
    const fwd = shrCurve.map(p => {
      const s = toSVG(p)
      return `${s.x.toFixed(1)},${s.y.toFixed(1)}`
    })
    const rev = [...hubCurve].reverse().map(p => {
      const s = toSVG(p)
      return `${s.x.toFixed(1)},${s.y.toFixed(1)}`
    })
    return `M${fwd.join(' L')} L${rev.join(' L')} Z`
  }, [shrCurve, hubCurve, toSVG])

  // -----------------------------------------------------------------------
  // Dimensions & metrics
  // -----------------------------------------------------------------------

  const dims = useMemo(() => computeDimensions(hubCPs, shrCPs), [hubCPs, shrCPs])
  const metrics = useMemo(() => computeLocalMetrics(hubCPs, shrCPs), [hubCPs, shrCPs])

  // -----------------------------------------------------------------------
  // Drag handlers
  // -----------------------------------------------------------------------

  const handleMouseDown = (curve: 'hub' | 'shr' | 'splitter', idx: number) => (e: React.MouseEvent) => {
    if (e.button !== 0) return // left click only
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
    setDragging({ curve, idx })
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Handle panning (middle button)
      if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x
        const dy = e.clientY - panStartRef.current.y
        const scale = viewBox.width / SVG_W
        setViewBox(prev => ({
          ...prev,
          x: panStartRef.current!.vbx - dx * scale,
          y: panStartRef.current!.vby - dy * scale,
        }))
        return
      }

      if (!dragging) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      // Account for viewBox transform
      const scaleX = viewBox.width / rect.width
      const scaleY = viewBox.height / rect.height
      const mx = viewBox.x + (e.clientX - rect.left) * scaleX
      const my = viewBox.y + (e.clientY - rect.top) * scaleY
      const phys = fromSVG(mx, my)

      // Clamp to positive r
      phys.r = Math.max(0, phys.r)

      const { curve, idx } = dragging

      if (curve === 'splitter') {
        setSplitterCPs(prev => {
          const next = [...prev]
          next[idx] = phys
          return next
        })
        return
      }

      const setCPs = curve === 'hub' ? setHubCPs : setShrCPs

      setCPs(prev => {
        const next = [...prev]
        // Endpoints: only allow radial movement (fix z for inlet/outlet)
        if (idx === 0) {
          next[0] = { r: phys.r, z: prev[0].z }
        } else if (idx === prev.length - 1) {
          next[idx] = { r: phys.r, z: prev[idx].z }
        } else {
          next[idx] = phys
        }
        return next
      })
    },
    [dragging, fromSVG, isPanning, viewBox],
  )

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      // Push to undo history on drag end
      pushToHistory()
    }
    setDragging(null)
    if (isPanning) {
      setIsPanning(false)
      panStartRef.current = null
    }
  }, [dragging, pushToHistory, isPanning])

  // -----------------------------------------------------------------------
  // Gap 6: Zoom/Pan handlers
  // -----------------------------------------------------------------------

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()

    const factor = e.deltaY < 0 ? 1 / 1.1 : 1.1
    const newWidth = viewBox.width * factor
    const newHeight = viewBox.height * factor

    // Enforce zoom limits (0.5x to 5x)
    const minW = SVG_W / 5
    const maxW = SVG_W / 0.5
    if (newWidth < minW || newWidth > maxW) return

    // Zoom centered on cursor position
    const mx = (e.clientX - rect.left) / rect.width
    const my = (e.clientY - rect.top) / rect.height

    setViewBox(prev => ({
      x: prev.x + (prev.width - newWidth) * mx,
      y: prev.y + (prev.height - newHeight) * my,
      width: newWidth,
      height: newHeight,
    }))
  }, [viewBox])

  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Middle button for pan
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        vbx: viewBox.x,
        vby: viewBox.y,
      }
    }
  }, [viewBox])

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Reset to fit-all view
    if (e.button === 0 && !dragging) {
      setViewBox({ x: 0, y: 0, width: SVG_W, height: SVG_H })
    }
  }, [dragging])

  // -----------------------------------------------------------------------
  // Gap 2: Context menu handlers
  // -----------------------------------------------------------------------

  const handleContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = viewBox.width / rect.width
    const scaleY = viewBox.height / rect.height
    const svgX = viewBox.x + (e.clientX - rect.left) * scaleX
    const svgY = viewBox.y + (e.clientY - rect.top) * scaleY

    // Check if clicking near a control point
    const checkPoints = (cps: RZPoint[], curveId: 'hub' | 'shroud' | 'splitter') => {
      for (let i = 0; i < cps.length; i++) {
        const s = toSVG(cps[i])
        const dist = Math.sqrt((s.x - svgX) ** 2 + (s.y - svgY) ** 2)
        if (dist < CP_RADIUS * 2) {
          return { pointIndex: i, curveId }
        }
      }
      return null
    }

    const hubHit = checkPoints(hubCPs, 'hub')
    if (hubHit) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'point',
        curveId: hubHit.curveId,
        pointIndex: hubHit.pointIndex,
      })
      return
    }
    const shrHit = checkPoints(shrCPs, 'shroud')
    if (shrHit) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'point',
        curveId: shrHit.curveId,
        pointIndex: shrHit.pointIndex,
      })
      return
    }
    if (showSplitter) {
      const splHit = checkPoints(splitterCPs, 'splitter')
      if (splHit) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'point',
          curveId: splHit.curveId,
          pointIndex: splHit.pointIndex,
        })
        return
      }
    }

    // Check if near a curve (for insert)
    const phys = fromSVG(svgX, svgY)
    const distToCurve = (curve: RZPoint[]) => {
      let minD = Infinity
      let bestSeg = 0
      for (let i = 0; i < curve.length - 1; i++) {
        const a = curve[i]
        const b = curve[i + 1]
        const t = Math.max(0, Math.min(1,
          ((phys.r - a.r) * (b.r - a.r) + (phys.z - a.z) * (b.z - a.z)) /
          ((b.r - a.r) ** 2 + (b.z - a.z) ** 2 || 1e-12),
        ))
        const pr = a.r + t * (b.r - a.r)
        const pz = a.z + t * (b.z - a.z)
        const d = Math.sqrt((phys.r - pr) ** 2 + (phys.z - pz) ** 2)
        if (d < minD) { minD = d; bestSeg = i }
      }
      return { dist: minD, seg: bestSeg }
    }

    // Use interpolated curves to detect proximity, but insert into control points
    const hubDist = distToCurve(hubCurve)
    const shrDist = distToCurve(shrCurve)
    const threshold = (rMax - rMin) * 0.08

    if (hubDist.dist < threshold || shrDist.dist < threshold) {
      const nearestCurve = hubDist.dist < shrDist.dist ? 'hub' : 'shroud'
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'curve',
        curveId: nearestCurve,
      })
    } else {
      setContextMenu(null)
    }
  }, [hubCPs, shrCPs, splitterCPs, showSplitter, toSVG, fromSVG, hubCurve, shrCurve, viewBox, rMax, rMin])

  const handleInsertPoint = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'curve') return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = viewBox.width / rect.width
    const scaleY = viewBox.height / rect.height
    const svgX = viewBox.x + (contextMenu.x - rect.left) * scaleX
    const svgY = viewBox.y + (contextMenu.y - rect.top) * scaleY
    const phys = fromSVG(svgX, svgY)

    pushToHistory()

    const cps = contextMenu.curveId === 'hub' ? hubCPs : shrCPs
    const setCPs = contextMenu.curveId === 'hub' ? setHubCPs : setShrCPs

    // Find nearest segment among control points
    let bestSeg = 0
    let bestDist = Infinity
    for (let i = 0; i < cps.length - 1; i++) {
      const a = cps[i]
      const b = cps[i + 1]
      const mid = { r: (a.r + b.r) / 2, z: (a.z + b.z) / 2 }
      const d = Math.sqrt((phys.r - mid.r) ** 2 + (phys.z - mid.z) ** 2)
      if (d < bestDist) { bestDist = d; bestSeg = i }
    }

    const newCPs = [...cps]
    newCPs.splice(bestSeg + 1, 0, { r: phys.r, z: phys.z })
    setCPs(newCPs)
    setContextMenu(null)
  }, [contextMenu, hubCPs, shrCPs, fromSVG, pushToHistory, viewBox])

  const handleDeletePoint = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'point' || contextMenu.pointIndex === undefined) return

    const cps = contextMenu.curveId === 'hub' ? hubCPs :
                contextMenu.curveId === 'shroud' ? shrCPs : splitterCPs
    if (cps.length <= 3) {
      setContextMenu(null)
      return
    }

    pushToHistory()

    const setCPs = contextMenu.curveId === 'hub' ? setHubCPs :
                   contextMenu.curveId === 'shroud' ? setShrCPs : setSplitterCPs
    const newCPs = cps.filter((_, i) => i !== contextMenu.pointIndex)
    setCPs(newCPs)
    setContextMenu(null)
  }, [contextMenu, hubCPs, shrCPs, splitterCPs, pushToHistory])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  // -----------------------------------------------------------------------
  // Gap 3: Numeric edit handler
  // -----------------------------------------------------------------------

  const handleNumericChange = useCallback((
    curveId: 'hub' | 'shroud' | 'splitter',
    idx: number,
    field: 'r' | 'z',
    valueStr: string,
  ) => {
    const val = parseFloat(valueStr)
    if (isNaN(val)) return

    const physVal = val / 1000 // mm to m

    const setCPs = curveId === 'hub' ? setHubCPs :
                   curveId === 'shroud' ? setShrCPs : setSplitterCPs

    setCPs(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: physVal }
      return next
    })

    // Debounced push to history
    if (numericDebounceRef.current) clearTimeout(numericDebounceRef.current)
    numericDebounceRef.current = setTimeout(() => {
      pushToHistory()
    }, 500)
  }, [pushToHistory])

  // -----------------------------------------------------------------------
  // Template loading
  // -----------------------------------------------------------------------

  const loadTemplate = async (templateName: string) => {
    setLoadingTemplate(true)
    setSelectedTemplate(templateName)
    try {
      const res = await fetch('/api/v1/meridional/templates/control_points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateName, d2: initD2, b2: initB2 }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      pushToHistory()
      setHubCPs(data.hub_points)
      setShrCPs(data.shroud_points)
      setInitialHub(data.hub_points)
      setInitialShr(data.shroud_points)
      setSplitterCPs(defaultSplitterCPs(data.hub_points, data.shroud_points))
      setValidation(null)
      setApplyResult(null)
    } catch {
      // Fallback to local defaults
      const r2 = initD2 / 2
      const hub = defaultHubCPs(r2, initB2, initD1)
      const shr = defaultShroudCPs(r2, initB2, initD1)
      setHubCPs(hub)
      setShrCPs(shr)
      setSplitterCPs(defaultSplitterCPs(hub, shr))
    } finally {
      setLoadingTemplate(false)
    }
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  const handleValidate = async () => {
    setValidating(true)
    try {
      const res = await fetch('/api/v1/meridional/validate_control_points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hub_points: hubCPs,
          shroud_points: shrCPs,
          n_output_points: 50,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ValidationResult = await res.json()
      setValidation(data)
    } catch (e: any) {
      setValidation({
        valid: false,
        errors: [`Request failed: ${e.message}`],
        warnings: [],
        metrics: metrics,
      })
    } finally {
      setValidating(false)
    }
  }

  // -----------------------------------------------------------------------
  // Apply to 3D
  // -----------------------------------------------------------------------

  const handleApply = async () => {
    setApplying(true)
    setApplyResult(null)
    try {
      const res = await fetch('/api/v1/meridional/from_control_points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hub_points: hubCPs,
          shroud_points: shrCPs,
          n_output_points: 50,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setApplyResult('Perfil meridional aplicado com sucesso.')
      const applyData: { hub_rz: RZPoint[]; shroud_rz: RZPoint[]; splitter_rz?: RZPoint[] } = {
        hub_rz: hubCPs,
        shroud_rz: shrCPs,
      }
      if (showSplitter) {
        applyData.splitter_rz = splitterCPs
      }
      if (onApply) onApply(applyData)
    } catch (e: any) {
      setApplyResult(`Falha: ${e.message}`)
    } finally {
      setApplying(false)
    }
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  const handleReset = () => {
    pushToHistory()
    setHubCPs([...initialHub])
    setShrCPs([...initialShr])
    setSplitterCPs(defaultSplitterCPs(initialHub, initialShr))
    setValidation(null)
    setApplyResult(null)
    setViewBox({ x: 0, y: 0, width: SVG_W, height: SVG_H })
  }

  // -----------------------------------------------------------------------
  // Grid / Axis helpers
  // -----------------------------------------------------------------------

  const gridLinesH = useMemo(() => {
    const lines: { val: number; y: number }[] = []
    const step = (rMax - rMin) / (GRID_LINES_Y + 1)
    for (let i = 1; i <= GRID_LINES_Y; i++) {
      const v = rMin + step * i
      const y = PAD.t + (1 - (v - rMin) / (rMax - rMin)) * INNER_H
      lines.push({ val: v, y })
    }
    return lines
  }, [rMin, rMax])

  const gridLinesV = useMemo(() => {
    const lines: { val: number; x: number }[] = []
    const step = (zMax - zMin) / (GRID_LINES_X + 1)
    for (let i = 1; i <= GRID_LINES_X; i++) {
      const v = zMin + step * i
      const x = PAD.l + ((v - zMin) / (zMax - zMin)) * INNER_W
      lines.push({ val: v, x })
    }
    return lines
  }, [zMin, zMax])

  // -----------------------------------------------------------------------
  // Dimension annotation lines
  // -----------------------------------------------------------------------

  const dimAnnotations = useMemo(() => {
    const hubOut = toSVG(hubCPs[hubCPs.length - 1])
    const shrOut = toSVG(shrCPs[shrCPs.length - 1])
    const hubIn = toSVG(hubCPs[0])
    const shrIn = toSVG(shrCPs[0])
    return { hubOut, shrOut, hubIn, shrIn }
  }, [hubCPs, shrCPs, toSVG])

  // -----------------------------------------------------------------------
  // Gap 5: LE/TE positions
  // -----------------------------------------------------------------------

  const leTeLines = useMemo(() => {
    // TE = outlet (last points, z ~ 0)
    const hubTE = toSVG(hubCPs[hubCPs.length - 1])
    const shrTE = toSVG(shrCPs[shrCPs.length - 1])
    // LE = inlet (first points, z ~ axLen)
    const hubLE = toSVG(hubCPs[0])
    const shrLE = toSVG(shrCPs[0])
    return { hubTE, shrTE, hubLE, shrLE }
  }, [hubCPs, shrCPs, toSVG])

  // -----------------------------------------------------------------------
  // Control point rendering helper
  // -----------------------------------------------------------------------

  const renderCP = (
    cps: RZPoint[],
    curve: 'hub' | 'shr' | 'splitter',
    baseColor: string,
  ) =>
    cps.map((cp, i) => {
      const s = toSVG(cp)
      const isEndpoint = i === 0 || i === cps.length - 1
      const isDragging = dragging?.curve === curve && dragging.idx === i
      const isHovered = hovering?.curve === curve && hovering.idx === i
      const curveLabel = curve === 'hub' ? 'hub' : curve === 'shr' ? 'shroud' : 'splitter'
      const isFocused = focusedPoint?.curve === curveLabel && focusedPoint.idx === i

      let fill = baseColor
      if (isDragging) fill = '#facc15'
      else if (isHovered) fill = '#f97316'
      else if (isFocused) fill = '#facc15'

      return (
        <circle
          key={`${curve}-${i}`}
          cx={s.x}
          cy={s.y}
          r={CP_RADIUS}
          fill={isEndpoint ? fill : 'var(--bg-surface)'}
          stroke={fill}
          strokeWidth={isFocused ? 3.5 : 2.5}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', transition: 'fill 0.1s' }}
          onMouseDown={handleMouseDown(curve, i)}
          onMouseEnter={() => setHovering({ curve, idx: i })}
          onMouseLeave={() => setHovering(null)}
        />
      )
    })

  // -----------------------------------------------------------------------
  // Control polygon lines (dashed) between adjacent control points
  // -----------------------------------------------------------------------

  const renderCPLines = (cps: RZPoint[], color: string) => {
    const lines: JSX.Element[] = []
    for (let i = 0; i < cps.length - 1; i++) {
      const a = toSVG(cps[i])
      const b = toSVG(cps[i + 1])
      lines.push(
        <line
          key={i}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={color} strokeWidth={1} strokeDasharray="4,3" opacity={0.35}
        />,
      )
    }
    return lines
  }

  // -----------------------------------------------------------------------
  // Gap 3: Numeric panel rendering
  // -----------------------------------------------------------------------

  const renderNumericPanel = () => {
    const curveGroups: { id: 'hub' | 'shroud' | 'splitter'; label: string; cps: RZPoint[]; color: string }[] = [
      { id: 'hub', label: 'Hub', cps: hubCPs, color: '#3b82f6' },
      { id: 'shroud', label: 'Shroud', cps: shrCPs, color: '#22d3ee' },
    ]
    if (showSplitter) {
      curveGroups.push({ id: 'splitter', label: 'Splitter', cps: splitterCPs, color: '#f59e0b' })
    }

    return (
      <div style={{
        flex: '0 0 200px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-primary)',
        borderRadius: 6,
        padding: 10,
        overflowY: 'auto',
        maxHeight: SVG_H + 80,
        fontSize: 12,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: 'var(--accent)',
          marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          Pontos de Controle
        </div>
        {curveGroups.map(group => (
          <div key={group.id} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: group.color,
              marginBottom: 4, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{group.label}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{group.cps.length} pts</span>
            </div>
            {group.cps.map((cp, i) => (
              <div key={i} style={{
                display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 9, width: 16, textAlign: 'right' }}>
                  {i}
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={(cp.r * 1000).toFixed(1)}
                  onChange={e => handleNumericChange(group.id, i, 'r', e.target.value)}
                  onFocus={() => setFocusedPoint({ curve: group.id, idx: i })}
                  onBlur={() => setFocusedPoint(null)}
                  title={`r [mm] - ${group.label}[${i}]`}
                  style={{
                    width: 70, padding: '2px 4px', fontSize: 11,
                    background: 'var(--bg-input)', border: '1px solid var(--border-primary)',
                    borderRadius: 3, color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <input
                  type="number"
                  step="0.1"
                  value={(cp.z * 1000).toFixed(1)}
                  onChange={e => handleNumericChange(group.id, i, 'z', e.target.value)}
                  onFocus={() => setFocusedPoint({ curve: group.id, idx: i })}
                  onBlur={() => setFocusedPoint(null)}
                  title={`z [mm] - ${group.label}[${i}]`}
                  style={{
                    width: 70, padding: '2px 4px', fontSize: 11,
                    background: 'var(--bg-input)', border: '1px solid var(--border-primary)',
                    borderRadius: 3, color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </div>
            ))}
          </div>
        ))}
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
          r [mm] | z [mm]
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const mm = (v: number) => (v * 1000).toFixed(1)

  return (
    <div ref={containerRef} style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      borderRadius: 8,
      padding: 16,
      position: 'relative',
      display: 'flex',
      gap: 16,
    }}>
      {/* Left: SVG + Numeric + Metrics (takes all space) */}
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--accent)',
          marginBottom: 10, letterSpacing: '0.04em',
        }}>
          EDITOR MERIDIONAL INTERATIVO
        </div>

        {/* Toolbar: Undo/Redo + Splitter toggle */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center',
        }}>
          <button
            onClick={undo}
            disabled={history.past.length === 0}
            title="Desfazer (Ctrl+Z)"
            style={{
              padding: '4px 10px', fontSize: 12, background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)', borderRadius: 4,
              color: history.past.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: history.past.length === 0 ? 'not-allowed' : 'pointer',
              opacity: history.past.length === 0 ? 0.5 : 1,
            }}
          >
            Desfazer
          </button>
          <button
            onClick={redo}
            disabled={history.future.length === 0}
            title="Refazer (Ctrl+Y)"
            style={{
              padding: '4px 10px', fontSize: 12, background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)', borderRadius: 4,
              color: history.future.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: history.future.length === 0 ? 'not-allowed' : 'pointer',
              opacity: history.future.length === 0 ? 0.5 : 1,
            }}
          >
            Refazer
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {history.past.length} passos
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{
              fontSize: 11, color: 'var(--text-secondary)', display: 'flex',
              alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={showSplitter}
                onChange={e => setShowSplitter(e.target.checked)}
                style={{ accentColor: '#f59e0b' }}
              />
              Splitter
            </label>
          </div>
        </div>

        {/* SVG + Numeric panel + Template — full width row */}
        <div style={{ display: 'flex', gap: 12 }}>
          {/* SVG Canvas — takes all available space */}
          <div style={{ position: 'relative', flex: '1 1 auto' }}>
            <svg
              ref={svgRef}
              width="100%"
              height={SVG_H}
              preserveAspectRatio="xMidYMid meet"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
              style={{
                background: 'var(--bg-primary)',
                borderRadius: 6,
                display: 'block',
                userSelect: 'none',
                border: '1px solid var(--border-primary)',
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onMouseDown={handleSvgMouseDown}
              onWheel={handleWheel}
              onDoubleClick={handleDoubleClick}
              onContextMenu={handleContextMenu}
            >
              {/* Grid */}
              {gridLinesV.map((g, i) => (
                <line key={`gv-${i}`}
                  x1={g.x} y1={PAD.t} x2={g.x} y2={PAD.t + INNER_H}
                  stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="3,3"
                />
              ))}
              {gridLinesH.map((g, i) => (
                <line key={`gh-${i}`}
                  x1={PAD.l} y1={g.y} x2={PAD.l + INNER_W} y2={g.y}
                  stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="3,3"
                />
              ))}

              {/* Grid tick labels */}
              {gridLinesV.map((g, i) => (
                <text key={`gtv-${i}`} x={g.x} y={PAD.t + INNER_H + 14}
                  fill="var(--text-muted)" fontSize={8} textAnchor="middle" fontFamily="Inter,sans-serif"
                >
                  {mm(g.val)}
                </text>
              ))}
              {gridLinesH.map((g, i) => (
                <text key={`gth-${i}`} x={PAD.l - 6} y={g.y + 3}
                  fill="var(--text-muted)" fontSize={8} textAnchor="end" fontFamily="Inter,sans-serif"
                >
                  {mm(g.val)}
                </text>
              ))}

              {/* Axes */}
              <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + INNER_H}
                stroke="var(--text-muted)" strokeWidth={1} />
              <line x1={PAD.l} y1={PAD.t + INNER_H} x2={PAD.l + INNER_W} y2={PAD.t + INNER_H}
                stroke="var(--text-muted)" strokeWidth={1} />

              {/* Axis labels */}
              <text x={PAD.l + INNER_W / 2} y={SVG_H - 4}
                fill="var(--text-secondary)" fontSize={11} textAnchor="middle" fontFamily="Inter,sans-serif"
              >
                Z [mm]
              </text>
              <text x={12} y={PAD.t + INNER_H / 2}
                fill="var(--text-secondary)" fontSize={11} textAnchor="middle" fontFamily="Inter,sans-serif"
                transform={`rotate(-90, 12, ${PAD.t + INNER_H / 2})`}
              >
                R [mm]
              </text>

              {/* Passage fill */}
              <path d={passagePath} fill="rgba(0,160,223,0.07)" stroke="none" />

              {/* Gap 5: LE/TE indicator lines */}
              <line
                x1={leTeLines.hubLE.x} y1={leTeLines.hubLE.y}
                x2={leTeLines.shrLE.x} y2={leTeLines.shrLE.y}
                stroke="#22c55e" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.6}
              />
              <text
                x={(leTeLines.hubLE.x + leTeLines.shrLE.x) / 2}
                y={Math.min(leTeLines.hubLE.y, leTeLines.shrLE.y) - 8}
                fill="#22c55e" fontSize={10} textAnchor="middle" fontFamily="Inter,sans-serif"
                fontWeight={600} opacity={0.8}
              >
                LE
              </text>
              <line
                x1={leTeLines.hubTE.x} y1={leTeLines.hubTE.y}
                x2={leTeLines.shrTE.x} y2={leTeLines.shrTE.y}
                stroke="#22c55e" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.6}
              />
              <text
                x={(leTeLines.hubTE.x + leTeLines.shrTE.x) / 2}
                y={Math.min(leTeLines.hubTE.y, leTeLines.shrTE.y) - 8}
                fill="#22c55e" fontSize={10} textAnchor="middle" fontFamily="Inter,sans-serif"
                fontWeight={600} opacity={0.8}
              >
                TE
              </text>

              {/* Inlet / outlet dashed lines */}
              <line
                x1={dimAnnotations.hubIn.x} y1={dimAnnotations.hubIn.y}
                x2={dimAnnotations.shrIn.x} y2={dimAnnotations.shrIn.y}
                stroke="rgba(0,160,223,0.4)" strokeWidth={1} strokeDasharray="5,3"
              />
              <line
                x1={dimAnnotations.hubOut.x} y1={dimAnnotations.hubOut.y}
                x2={dimAnnotations.shrOut.x} y2={dimAnnotations.shrOut.y}
                stroke="rgba(0,160,223,0.4)" strokeWidth={1} strokeDasharray="5,3"
              />

              {/* Hub curve */}
              <path d={hubPath} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinejoin="round" />
              {/* Shroud curve */}
              <path d={shrPath} fill="none" stroke="#22d3ee" strokeWidth={2.5} strokeLinejoin="round" />
              {/* Splitter curve */}
              {showSplitter && splitterPath && (
                <path d={splitterPath} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" strokeDasharray="8,4" />
              )}

              {/* Control polygon lines */}
              {renderCPLines(hubCPs, '#3b82f6')}
              {renderCPLines(shrCPs, '#22d3ee')}
              {showSplitter && renderCPLines(splitterCPs, '#f59e0b')}

              {/* Control points — drawn last so they're on top */}
              {renderCP(hubCPs, 'hub', '#3b82f6')}
              {renderCP(shrCPs, 'shr', '#22d3ee')}
              {showSplitter && renderCP(splitterCPs, 'splitter', '#f59e0b')}

              {/* Curve labels */}
              {(() => {
                const hEnd = toSVG(hubCurve[hubCurve.length - 1])
                const sEnd = toSVG(shrCurve[shrCurve.length - 1])
                return (
                  <>
                    <text x={hEnd.x + 12} y={hEnd.y + 4} fill="#3b82f6" fontSize={11} fontFamily="Inter,sans-serif" fontWeight={600}>Hub</text>
                    <text x={sEnd.x + 12} y={sEnd.y + 4} fill="#22d3ee" fontSize={11} fontFamily="Inter,sans-serif" fontWeight={600}>Shroud</text>
                    {showSplitter && splitterCurve.length > 0 && (() => {
                      const spEnd = toSVG(splitterCurve[splitterCurve.length - 1])
                      return <text x={spEnd.x + 12} y={spEnd.y + 4} fill="#f59e0b" fontSize={11} fontFamily="Inter,sans-serif" fontWeight={600}>Splitter</text>
                    })()}
                  </>
                )
              })()}

              {/* D2 dimension annotation */}
              {(() => {
                const xOff = dimAnnotations.hubOut.x + 16
                return (
                  <>
                    <line x1={xOff} y1={dimAnnotations.hubOut.y} x2={xOff} y2={dimAnnotations.shrOut.y}
                      stroke="#4ade80" strokeWidth={1} />
                    <line x1={xOff - 3} y1={dimAnnotations.hubOut.y} x2={xOff + 3} y2={dimAnnotations.hubOut.y}
                      stroke="#4ade80" strokeWidth={1} />
                    <line x1={xOff - 3} y1={dimAnnotations.shrOut.y} x2={xOff + 3} y2={dimAnnotations.shrOut.y}
                      stroke="#4ade80" strokeWidth={1} />
                    <text x={xOff + 6} y={(dimAnnotations.hubOut.y + dimAnnotations.shrOut.y) / 2 + 4}
                      fill="#4ade80" fontSize={9} fontFamily="Inter,sans-serif">
                      b2={mm(dims.b2)}
                    </text>
                  </>
                )
              })()}
            </svg>

            {/* Gap 6: Zoom level indicator */}
            <div style={{
              position: 'absolute', bottom: 6, right: 6,
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              fontSize: 10, padding: '2px 6px', borderRadius: 3,
              fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
            }}>
              {zoomLevel}%
            </div>
          </div>

          {/* Gap 3: Numeric panel */}
          {renderNumericPanel()}
        </div>

        {/* Real-time metrics */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginTop: 10,
        }}>
          {[
            { label: 'Area Ratio (A_in/A_out)', value: metrics.passage_area_ratio.toFixed(3) },
            { label: 'L / D2', value: metrics.l_d2.toFixed(3) },
            { label: 'Curv. Radius Hub', value: metrics.curvature_radius_hub === Infinity ? '\u221e' : `${(metrics.curvature_radius_hub * 1000).toFixed(1)} mm` },
            { label: 'Curv. Radius Shroud', value: metrics.curvature_radius_shroud === Infinity ? '\u221e' : `${(metrics.curvature_radius_shroud * 1000).toFixed(1)} mm` },
          ].map(m => (
            <div key={m.label} style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              padding: '6px 10px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {m.label}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Right: Side Controls ---------- */}
      <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
        {/* Template selector */}
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Template
          </label>
          <select
            value={selectedTemplate}
            onChange={e => loadTemplate(e.target.value)}
            disabled={loadingTemplate}
            style={{
              width: '100%',
              padding: '7px 10px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {TEMPLATES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Computed dimensions */}
        <div style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 6,
          padding: 10,
        }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Dimensoes
          </div>
          {[
            { label: 'D1', value: `${mm(dims.d1)} mm` },
            { label: 'D2', value: `${mm(dims.d2)} mm` },
            { label: 'b1', value: `${mm(dims.b1)} mm` },
            { label: 'b2', value: `${mm(dims.b2)} mm` },
            { label: 'Axial', value: `${mm(dims.axialLength)} mm` },
          ].map(d => (
            <div key={d.label} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
            </div>
          ))}
        </div>

        {/* Validate button */}
        <button
          onClick={handleValidate}
          disabled={validating}
          style={{
            padding: '8px 14px',
            background: 'transparent',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            cursor: validating ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            opacity: validating ? 0.7 : 1,
          }}
        >
          {validating ? 'Validando...' : 'Validar'}
        </button>

        {/* Validation result */}
        {validation && (
          <div style={{
            background: 'var(--bg-primary)',
            border: `1px solid ${validation.valid ? '#4ade80' : '#ef4444'}`,
            borderRadius: 6,
            padding: 10,
            fontSize: 12,
          }}>
            <div style={{
              color: validation.valid ? '#4ade80' : '#ef4444',
              fontWeight: 600, marginBottom: 4,
            }}>
              {validation.valid ? '\u2713 Geometria valida' : '\u2717 Problemas encontrados'}
            </div>
            {validation.errors.map((e, i) => (
              <div key={`e-${i}`} style={{ color: '#ef4444', fontSize: 11, marginBottom: 2 }}>
                {e}
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={`w-${i}`} style={{ color: '#facc15', fontSize: 11, marginBottom: 2 }}>
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Apply button */}
        <button
          onClick={handleApply}
          disabled={applying}
          style={{
            padding: '9px 14px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: applying ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            opacity: applying ? 0.7 : 1,
          }}
        >
          {applying ? 'Aplicando...' : 'Aplicar ao 3D'}
        </button>

        {/* Reset button */}
        <button
          onClick={handleReset}
          style={{
            padding: '7px 14px',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Reset
        </button>

        {/* Apply result message */}
        {applyResult && (
          <div style={{
            fontSize: 12,
            color: applyResult.startsWith('Falha') ? '#ef4444' : '#4ade80',
            padding: '6px 10px',
            background: 'var(--bg-primary)',
            borderRadius: 4,
            border: '1px solid var(--border-primary)',
          }}>
            {applyResult}
          </div>
        )}

        {/* Help text */}
        <div style={{
          fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
          marginTop: 'auto', padding: '8px 0',
        }}>
          Arraste os pontos de controle para editar hub (azul) e shroud (ciano).
          Pontos dos extremos movem apenas radialmente. Pontos interiores sao livres.
          Clique direito para inserir/deletar pontos. Scroll para zoom, botao do meio para pan.
          Duplo-clique para resetar zoom.
        </div>
      </div>

      {/* Gap 2: Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 1000,
            minWidth: 150,
            padding: '4px 0',
          }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'point' && (
            <button
              onClick={handleDeletePoint}
              disabled={(() => {
                const cps = contextMenu.curveId === 'hub' ? hubCPs :
                            contextMenu.curveId === 'shroud' ? shrCPs : splitterCPs
                return cps.length <= 3
              })()}
              style={{
                display: 'block', width: '100%', padding: '6px 14px',
                background: 'transparent', border: 'none', color: '#ef4444',
                fontSize: 12, textAlign: 'left', cursor: 'pointer',
                opacity: (() => {
                  const cps = contextMenu.curveId === 'hub' ? hubCPs :
                              contextMenu.curveId === 'shroud' ? shrCPs : splitterCPs
                  return cps.length <= 3 ? 0.4 : 1
                })(),
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Deletar ponto
            </button>
          )}
          {contextMenu.type === 'curve' && (
            <button
              onClick={handleInsertPoint}
              style={{
                display: 'block', width: '100%', padding: '6px 14px',
                background: 'transparent', border: 'none', color: 'var(--text-primary)',
                fontSize: 12, textAlign: 'left', cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Inserir ponto aqui ({contextMenu.curveId})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
