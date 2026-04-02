import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

interface BladePoint { x: number; y: number; z: number }
interface ImpellerData {
  blades: BladePoint[][]
  hub_profile: BladePoint[]
  shroud_profile: BladePoint[]
  blade_count: number
  d2: number
}

interface Props {
  flowRate: number
  head: number
  rpm: number
}

function BladeMesh({ points, color }: { points: BladePoint[]; color: string }) {
  const geometry = useMemo(() => {
    if (points.length < 2) return new THREE.BufferGeometry()

    // Create a tube-like blade by extruding points in Z
    const positions: number[] = []
    const bladeHeight = 5 // mm offset for blade thickness

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i]
      const p1 = points[i + 1]

      // Two triangles per segment (quad extruded in z)
      // Bottom face
      positions.push(p0.x, p0.y, p0.z)
      positions.push(p1.x, p1.y, p1.z)
      positions.push(p0.x, p0.y, p0.z + bladeHeight)

      positions.push(p1.x, p1.y, p1.z)
      positions.push(p1.x, p1.y, p1.z + bladeHeight)
      positions.push(p0.x, p0.y, p0.z + bladeHeight)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    return geo
  }, [points])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={0.4} roughness={0.5} />
    </mesh>
  )
}

function HubDisk({ profile, bladeCount }: { profile: BladePoint[]; bladeCount: number }) {
  const geometry = useMemo(() => {
    if (profile.length < 2) return new THREE.BufferGeometry()

    // Revolution of hub profile around Y=0, Z axis
    const segments = 60
    const positions: number[] = []

    for (let i = 0; i < profile.length - 1; i++) {
      const r0 = profile[i].x  // radius in mm
      const z0 = profile[i].z
      const r1 = profile[i + 1].x
      const z1 = profile[i + 1].z

      for (let j = 0; j < segments; j++) {
        const a0 = (j / segments) * Math.PI * 2
        const a1 = ((j + 1) / segments) * Math.PI * 2

        // Quad as two triangles
        positions.push(r0 * Math.cos(a0), r0 * Math.sin(a0), z0)
        positions.push(r1 * Math.cos(a0), r1 * Math.sin(a0), z1)
        positions.push(r0 * Math.cos(a1), r0 * Math.sin(a1), z0)

        positions.push(r1 * Math.cos(a0), r1 * Math.sin(a0), z1)
        positions.push(r1 * Math.cos(a1), r1 * Math.sin(a1), z1)
        positions.push(r0 * Math.cos(a1), r0 * Math.sin(a1), z0)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    return geo
  }, [profile])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} side={THREE.DoubleSide} />
    </mesh>
  )
}

function RotatingGroup({ children, rpm }: { children: React.ReactNode; rpm: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.z += delta * 0.5 // Slow rotation for visual
    }
  })
  return <group ref={ref}>{children}</group>
}

function Scene({ data }: { data: ImpellerData }) {
  const scale = 1.0 / Math.max(data.d2 * 500, 1) // Normalize to ~1 unit

  return (
    <>
      <PerspectiveCamera makeDefault position={[2, 2, 1.5]} />
      <OrbitControls enableDamping dampingFactor={0.1} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-3, -1, 2]} intensity={0.3} />

      <RotatingGroup rpm={0}>
        <group scale={[scale, scale, scale]}>
          {/* Hub disk */}
          <HubDisk profile={data.hub_profile} bladeCount={data.blade_count} />

          {/* Blades */}
          {data.blades.map((blade, i) => (
            <BladeMesh key={i} points={blade} color="#2E8B57" />
          ))}
        </group>
      </RotatingGroup>

      {/* Grid helper */}
      <gridHelper args={[4, 20, '#ddd', '#eee']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.5]} />
    </>
  )
}

export default function ImpellerViewer({ flowRate, head, rpm }: Props) {
  const [data, setData] = useState<ImpellerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (flowRate <= 0 || head <= 0 || rpm <= 0) return

    setLoading(true)
    setError(null)

    fetch('/api/v1/geometry/impeller', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_rate: flowRate / 3600, // m3/h to m3/s
        head,
        rpm,
        n_blade_points: 40,
      }),
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [flowRate, head, rpm])

  if (loading) return <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>Loading 3D geometry...</div>
  if (error) return <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c00' }}>Failed to load geometry: {error}</div>
  if (!data) return <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>No geometry data</div>

  return (
    <div>
      <h3 style={{ color: '#2E8B57', fontSize: 15, marginBottom: 8 }}>3D Impeller</h3>
      <div style={{ height: 420, borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0', background: '#f8f8f8' }}>
        <Canvas>
          <Scene data={data} />
        </Canvas>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#888' }}>
        <span>{data.blade_count} blades</span>
        <span>D2: {(data.d2 * 1000).toFixed(0)} mm</span>
        <span>Drag to rotate, scroll to zoom</span>
      </div>
    </div>
  )
}
