const API_BASE = '/api/v1'

export async function runSizing(flowRate: number, head: number, rpm: number) {
  const res = await fetch(`${API_BASE}/sizing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_rate: flowRate, head, rpm }),
  })
  if (!res.ok) throw new Error(`Sizing failed: ${res.status}`)
  return res.json()
}

export async function getCurves(flowRate: number, head: number, rpm: number, nPoints = 25) {
  const res = await fetch(`${API_BASE}/curves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_rate: flowRate, head, rpm, n_points: nPoints }),
  })
  if (!res.ok) throw new Error(`Curves failed: ${res.status}`)
  return res.json()
}

export async function runOptimize(
  flowRate: number, head: number, rpm: number,
  method = 'nsga2', popSize = 20, nGen = 20,
) {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flow_rate: flowRate, head, rpm, method,
      pop_size: popSize, n_gen: nGen,
    }),
  })
  if (!res.ok) throw new Error(`Optimize failed: ${res.status}`)
  return res.json()
}

export async function runStressAnalysis(flowRate: number, head: number, rpm: number) {
  const res = await fetch(`${API_BASE}/stress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_rate: flowRate, head, rpm }),
  })
  if (!res.ok) throw new Error(`Stress failed: ${res.status}`)
  return res.json()
}

export async function runInverseDesign(
  flowRate: number, head: number, rpm: number,
  loadingType = 'mid_loaded',
) {
  const res = await fetch(`${API_BASE}/inverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_rate: flowRate, head, rpm, loading_type: loadingType }),
  })
  if (!res.ok) throw new Error(`Inverse failed: ${res.status}`)
  return res.json()
}

export async function getLossBreakdown(flowRate: number, head: number, rpm: number) {
  const res = await fetch(`${API_BASE}/losses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_rate: flowRate, head, rpm }),
  })
  if (!res.ok) throw new Error(`Losses failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Version History API
// ---------------------------------------------------------------------------

export interface VersionEntry {
  id: string
  version_number: number
  label: string
  nq: number
  eta: number
  d2_mm: number
  npsh: number
  power_kw: number
  flow_rate: number
  head: number
  rpm: number
  created_at: string
}

export interface VersionDetail {
  id: string
  version_number: number
  label: string
  created_at: string
  operating_point: { flow_rate: number; head: number; rpm: number }
  sizing_result: Record<string, any>
}

export interface VersionCompareResult {
  a: { version: VersionEntry; sizing_result: Record<string, any> }
  b: { version: VersionEntry; sizing_result: Record<string, any> }
  deltas: Record<string, { a: number; b: number; delta: number; pct: number }>
}

export async function saveVersion(
  operatingPoint: { flow_rate: number; head: number; rpm: number },
  sizingResult: Record<string, any>,
  projectId?: string,
  label?: string,
): Promise<VersionEntry> {
  const res = await fetch(`${API_BASE}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId || null,
      operating_point: operatingPoint,
      sizing_result: sizingResult,
      label: label || null,
    }),
  })
  if (!res.ok) throw new Error(`Save version failed: ${res.status}`)
  return res.json()
}

export async function listVersions(projectId?: string, limit = 50): Promise<VersionEntry[]> {
  const params = new URLSearchParams()
  if (projectId) params.set('project_id', projectId)
  params.set('limit', String(limit))
  const res = await fetch(`${API_BASE}/versions?${params}`)
  if (!res.ok) throw new Error(`List versions failed: ${res.status}`)
  return res.json()
}

export async function getVersion(id: string): Promise<VersionDetail> {
  const res = await fetch(`${API_BASE}/versions/${id}`)
  if (!res.ok) throw new Error(`Get version failed: ${res.status}`)
  return res.json()
}

export async function compareVersions(a: string, b: string): Promise<VersionCompareResult> {
  const res = await fetch(`${API_BASE}/versions/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version_a: a, version_b: b }),
  })
  if (!res.ok) throw new Error(`Compare versions failed: ${res.status}`)
  return res.json()
}

export async function deleteVersion(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/versions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete version failed: ${res.status}`)
}

// ---------------------------------------------------------------------------
// CSV Export (client-side)
// ---------------------------------------------------------------------------

export function exportSizingCSV(sizing: any, opPoint: any): void {
  const rows = [
    ['Parametro', 'Valor', 'Unidade'],
    ['Vazao Q', (opPoint.flowRate).toFixed(2), 'm3/h'],
    ['Altura H', opPoint.head.toFixed(1), 'm'],
    ['Rotacao n', opPoint.rpm.toFixed(0), 'rpm'],
    ['Nq', sizing.specific_speed_nq.toFixed(1), ''],
    ['D2', (sizing.impeller_d2*1000).toFixed(0), 'mm'],
    ['D1', (sizing.impeller_d1*1000).toFixed(0), 'mm'],
    ['b2', (sizing.impeller_b2*1000).toFixed(1), 'mm'],
    ['Z pas', sizing.blade_count, ''],
    ['beta1', sizing.beta1.toFixed(1), 'deg'],
    ['beta2', sizing.beta2.toFixed(1), 'deg'],
    ['eta total', (sizing.estimated_efficiency*100).toFixed(1), '%'],
    ['Potencia', (sizing.estimated_power/1000).toFixed(1), 'kW'],
    ['NPSHr', sizing.estimated_npsh_r.toFixed(1), 'm'],
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'hpe-sizing.csv'; a.click()
  URL.revokeObjectURL(url)
}
