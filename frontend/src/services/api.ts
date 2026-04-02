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
