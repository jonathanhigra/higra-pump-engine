# HPE API Reference

Base URL: `http://localhost:8000`

## POST /api/v1/sizing

Run 1D meanline sizing.

**Request:**
```json
{
  "flow_rate": 0.05,
  "head": 30.0,
  "rpm": 1750,
  "machine_type": "centrifugal_pump",
  "fluid": "water"
}
```

**Response:**
```json
{
  "specific_speed_nq": 30.5,
  "impeller_type": "radial",
  "impeller_d2": 0.285,
  "impeller_d1": 0.106,
  "impeller_b2": 0.020,
  "blade_count": 5,
  "beta1": 20.3,
  "beta2": 19.7,
  "estimated_efficiency": 0.799,
  "estimated_power": 18400,
  "estimated_npsh_r": 7.6,
  "sigma": 0.254,
  "velocity_triangles": {...},
  "meridional_profile": {...},
  "warnings": [...]
}
```

## POST /api/v1/curves

Generate performance curves.

**Request:**
```json
{
  "flow_rate": 0.05,
  "head": 30.0,
  "rpm": 1750,
  "n_points": 20,
  "q_min_ratio": 0.1,
  "q_max_ratio": 1.5
}
```

**Response:**
```json
{
  "points": [
    {"flow_rate": 0.005, "head": 53.2, "efficiency": 0.79, "power": 3300, "npsh_required": 5.3},
    ...
  ],
  "bep_flow": 0.05,
  "bep_head": 36.0,
  "bep_efficiency": 0.894
}
```

## POST /api/v1/optimize

Run multi-objective optimization.

**Request:**
```json
{
  "flow_rate": 0.05,
  "head": 30.0,
  "rpm": 1750,
  "method": "nsga2",
  "pop_size": 40,
  "n_gen": 50,
  "seed": 42
}
```

**Response:**
```json
{
  "pareto_front": [
    {"variables": {"beta2": 28.5, "d2_factor": 1.02, ...}, "objectives": {"efficiency": 0.89, "npsh_r": 5.2, "robustness": 0.87}},
    ...
  ],
  "n_evaluations": 2040,
  "best_efficiency": {...},
  "best_npsh": {...}
}
```

## GET /health

**Response:** `{"status": "ok", "service": "higra-pump-engine"}`
