const API_BASE = 'http://localhost:8000/api/v1'

export async function runSizing(flowRate: number, head: number, rpm: number) {
  const res = await fetch(`${API_BASE}/sizing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_rate: flowRate, head, rpm }),
  })
  if (!res.ok) throw new Error(`Sizing failed: ${res.status}`)
  return res.json()
}

export async function getCurves(flowRate: number, head: number, rpm: number, nPoints = 20) {
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
