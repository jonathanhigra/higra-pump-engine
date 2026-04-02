/**
 * MeridionalPanel — 2D side-view of the impeller meridional passage.
 *
 * Renders hub curve, shroud curve, inlet/outlet markers, and annotates
 * key dimensions (D1, D2, b2, axial length) directly on the SVG.
 */
import React from 'react'

interface Point { x: number; y: number; z: number }

interface Props {
  hubProfile: Point[]
  shroudProfile: Point[]
  d2: number        // m
  d1?: number       // m
  b2?: number       // m
  wrapAngle?: number // deg
  compact?: boolean  // smaller version for non-fullscreen
}

function mapToSVG(
  pts: Point[],
  xRange: [number, number],
  yRange: [number, number],
  svgW: number,
  svgH: number,
  pad: number,
) {
  const [xMin, xMax] = xRange
  const [yMin, yMax] = yRange
  const w = svgW - pad * 2
  const h = svgH - pad * 2
  return pts.map(p => ({
    sx: pad + ((p.z - xMin) / (xMax - xMin + 1e-9)) * w,
    sy: pad + (1 - (p.x - yMin) / (yMax - yMin + 1e-9)) * h,
  }))
}

function toPolyline(mapped: { sx: number; sy: number }[]) {
  return mapped.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')
}

export default function MeridionalPanel({
  hubProfile, shroudProfile, d2, d1, b2, wrapAngle, compact = false,
}: Props) {
  const svgW = compact ? 200 : 280
  const svgH = compact ? 160 : 220
  const pad = compact ? 28 : 36

  const allPts = [...hubProfile, ...shroudProfile]
  if (allPts.length < 2) return null

  const zVals = allPts.map(p => p.z)
  const xVals = allPts.map(p => p.x)
  const zMin = Math.min(...zVals), zMax = Math.max(...zVals)
  const xMin = 0, xMax = Math.max(...xVals)

  const hubMapped = mapToSVG(hubProfile, [zMin, zMax], [xMin, xMax], svgW, svgH, pad)
  const shrMapped = mapToSVG(shroudProfile, [zMin, zMax], [xMin, xMax], svgW, svgH, pad)

  // Key points
  const hubOut = hubMapped[hubMapped.length - 1]
  const shrIn = shrMapped[0]
  const shrOut = shrMapped[shrMapped.length - 1]
  const hubIn = hubMapped[0]

  const fontSize = compact ? 7 : 9
  const strokeW = compact ? 1.5 : 2

  return (
    <div style={{
      background: '#0a0f14',
      border: '1px solid rgba(0,160,223,0.2)',
      borderRadius: 6,
      padding: 4,
    }}>
      <div style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600, padding: '4px 8px 2px', letterSpacing: '0.05em' }}>
        SEÇÃO MERIDIONAL
      </div>
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f}
            x1={pad + f * (svgW - pad * 2)} y1={pad}
            x2={pad + f * (svgW - pad * 2)} y2={svgH - pad}
            stroke="#1a2a3a" strokeWidth={0.5} strokeDasharray="3,3" />
        ))}
        {[0.33, 0.67].map(f => (
          <line key={f}
            x1={pad} y1={pad + f * (svgH - pad * 2)}
            x2={svgW - pad} y2={pad + f * (svgH - pad * 2)}
            stroke="#1a2a3a" strokeWidth={0.5} strokeDasharray="3,3" />
        ))}

        {/* Shroud curve (semi-transparent) */}
        <polyline
          points={toPolyline(shrMapped)}
          fill="none"
          stroke="rgba(0,160,223,0.4)"
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />

        {/* Hub curve */}
        <polyline
          points={toPolyline(hubMapped)}
          fill="none"
          stroke="#00A0DF"
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />

        {/* Fill passage area */}
        <polygon
          points={[
            ...shrMapped.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`),
            ...[...hubMapped].reverse().map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`),
          ].join(' ')}
          fill="rgba(0,160,223,0.06)"
          stroke="none"
        />

        {/* Inlet line */}
        <line x1={hubIn.sx} y1={hubIn.sy} x2={shrIn.sx} y2={shrIn.sy}
          stroke="rgba(0,160,223,0.5)" strokeWidth={1} strokeDasharray="4,2" />

        {/* Outlet line */}
        <line x1={hubOut.sx} y1={hubOut.sy} x2={shrOut.sx} y2={shrOut.sy}
          stroke="rgba(0,160,223,0.5)" strokeWidth={1} strokeDasharray="4,2" />

        {/* D2 dimension arrow */}
        {hubOut && shrOut && (
          <>
            <line x1={hubOut.sx + 10} y1={hubOut.sy} x2={hubOut.sx + 10} y2={shrOut.sy}
              stroke="#4ade80" strokeWidth={0.8} markerEnd="url(#arr)" />
            <text x={hubOut.sx + 14} y={(hubOut.sy + shrOut.sy) / 2 + 3}
              fill="#4ade80" fontSize={fontSize} fontFamily="Inter,sans-serif">
              D2={((d2 || 0) * 1000).toFixed(0)}mm
            </text>
          </>
        )}

        {/* D1 label at inlet */}
        {d1 && shrIn && (
          <text x={shrIn.sx - 2} y={shrIn.sy - 6}
            fill="rgba(0,160,223,0.7)" fontSize={fontSize} fontFamily="Inter,sans-serif" textAnchor="middle">
            D1={((d1 || 0) * 1000).toFixed(0)}
          </text>
        )}

        {/* Wrap angle label */}
        {wrapAngle != null && (
          <text x={svgW - pad - 2} y={pad + 12}
            fill="rgba(200,200,200,0.6)" fontSize={fontSize} fontFamily="Inter,sans-serif" textAnchor="end">
            Wrap {wrapAngle.toFixed(0)}°
          </text>
        )}

        {/* Axis labels */}
        <text x={pad} y={svgH - 4} fill="#374151" fontSize={fontSize} fontFamily="Inter,sans-serif">z→</text>
        <text x={4} y={pad + 4} fill="#374151" fontSize={fontSize} fontFamily="Inter,sans-serif">r↑</text>

        {/* Axis ticks — z */}
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={pad + f * (svgW - pad * 2)} y1={svgH - pad}
              x2={pad + f * (svgW - pad * 2)} y2={svgH - pad + 3}
              stroke="#374151" strokeWidth={0.8} />
            <text x={pad + f * (svgW - pad * 2)} y={svgH - pad + 10}
              fill="#374151" fontSize={6} fontFamily="Inter,sans-serif" textAnchor="middle">
              {((zMin + f * (zMax - zMin)) / 1).toFixed(0)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
