"""Testes de integração da API HPE FastAPI.

Testa todos os endpoints definidos em hpe.api.main usando o TestClient
do FastAPI (sem servidor real — execução in-process).

Endpoints cobertos
------------------
  GET  /health               — health check
  POST /sizing/run           — sizing 1D meanline
  POST /surrogate/predict    — predição via surrogate
  GET  /surrogate/similar    — busca de designs similares

Execução
--------
    pytest tests/test_api_integration.py -v
    pytest tests/test_api_integration.py -v -k "sizing"  # só sizing
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from hpe.api.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

SIZING_VALID = {
    "Q": 0.05,      # 180 m3/h
    "H": 30.0,      # m
    "n": 1750.0,    # rpm
    "fluid": "water",
    "rho": 998.0,
    "nu": 1.004e-6,
}

SURROGATE_VALID = {
    "Ns": 33.5,
    "D2": 320.0,    # mm
    "b2": 28.0,     # mm
    "beta2": 22.5,  # deg
    "n": 1750.0,
    "Q": 0.05,
    "H": 30.0,
    "n_stages": 1,
}


# ===========================================================================
# /health
# ===========================================================================

class TestHealth:
    def test_returns_200(self):
        r = client.get("/health")
        assert r.status_code == 200

    def test_body_fields(self):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert "version" in body
        assert "service" in body

    def test_version_format(self):
        version = client.get("/health").json()["version"]
        parts = version.split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)


# ===========================================================================
# /sizing/run
# ===========================================================================

class TestSizingRun:
    def test_valid_request_200(self):
        r = client.post("/sizing/run", json=SIZING_VALID)
        assert r.status_code == 200, r.text

    def test_response_schema(self):
        body = client.post("/sizing/run", json=SIZING_VALID).json()
        required = ["Ns", "Nq", "omega_s", "D1", "D2", "b2",
                    "beta1", "beta2", "u2", "eta_hid", "eta_total",
                    "P_shaft", "NPSHr", "warnings", "computation_time_ms"]
        for field in required:
            assert field in body, f"Missing field: {field}"

    def test_physics_plausible(self):
        """Output values must be physically reasonable."""
        body = client.post("/sizing/run", json=SIZING_VALID).json()

        # Specific speed for Q=0.05 m3/s, H=30m, n=1750rpm → Ns ≈ 32
        assert 15 < body["Ns"] < 150, f"Ns={body['Ns']} out of range"

        # D2 between 50mm and 800mm
        d2_mm = body["D2"] * 1000
        assert 50 < d2_mm < 800, f"D2={d2_mm:.0f}mm out of range"

        # Efficiency between 0.4 and 0.95
        assert 0.4 < body["eta_total"] < 0.95, f"eta={body['eta_total']}"

        # Shaft power: ρgQH/η → ~17.5 kW / 0.8 ≈ 22 kW
        rho, g, Q, H = 998, 9.806, 0.05, 30
        p_ideal = rho * g * Q * H / 1000  # kW ≈ 14.7 kW
        assert p_ideal * 0.8 < body["P_shaft"] < p_ideal * 3.0, \
            f"P_shaft={body['P_shaft']:.1f}kW implausible"

        # NPSHr positive
        assert body["NPSHr"] > 0

        # Latency logged
        assert body["computation_time_ms"] >= 0

    def test_blade_angles_in_range(self):
        body = client.post("/sizing/run", json=SIZING_VALID).json()
        assert 5 < body["beta1"] < 80, f"beta1={body['beta1']}"
        assert 5 < body["beta2"] < 60, f"beta2={body['beta2']}"

    def test_high_flow_mixed_pump(self):
        """Mixed-flow range: high Q, low H → high Ns."""
        inp = {"Q": 0.5, "H": 15.0, "n": 1450.0, "rho": 998.0, "nu": 1.004e-6}
        r = client.post("/sizing/run", json=inp)
        assert r.status_code == 200, r.text
        body = r.json()
        # Higher Ns expected for mixed-flow
        assert body["Ns"] > 50

    def test_multistage_high_head(self):
        """High head pump — sizing should still converge."""
        inp = {"Q": 0.03, "H": 120.0, "n": 3000.0, "rho": 998.0, "nu": 1.004e-6}
        r = client.post("/sizing/run", json=inp)
        assert r.status_code == 200, r.text

    def test_invalid_negative_Q(self):
        bad = {**SIZING_VALID, "Q": -0.01}
        r = client.post("/sizing/run", json=bad)
        assert r.status_code == 422

    def test_invalid_zero_H(self):
        bad = {**SIZING_VALID, "H": 0.0}
        r = client.post("/sizing/run", json=bad)
        assert r.status_code == 422

    def test_invalid_zero_n(self):
        bad = {**SIZING_VALID, "n": 0.0}
        r = client.post("/sizing/run", json=bad)
        assert r.status_code == 422

    def test_missing_required_field(self):
        bad = {"H": 30.0, "n": 1750.0}  # missing Q
        r = client.post("/sizing/run", json=bad)
        assert r.status_code == 422

    def test_warnings_is_list(self):
        body = client.post("/sizing/run", json=SIZING_VALID).json()
        assert isinstance(body["warnings"], list)

    def test_response_deterministic(self):
        """Same input must produce same output (cache / determinism)."""
        r1 = client.post("/sizing/run", json=SIZING_VALID).json()
        r2 = client.post("/sizing/run", json=SIZING_VALID).json()
        assert r1["D2"] == r2["D2"]
        assert r1["eta_total"] == r2["eta_total"]

    def test_scaling_affinity_law(self):
        """Double the speed → ~4x the head at same flow (H ∝ n²)."""
        inp_low  = {**SIZING_VALID, "n": 1000.0, "H": 15.0}
        inp_high = {**SIZING_VALID, "n": 2000.0, "H": 60.0}
        r_low  = client.post("/sizing/run", json=inp_low).json()
        r_high = client.post("/sizing/run", json=inp_high).json()
        # D2 should be similar (same affinity group)
        d2_ratio = r_high["D2"] / r_low["D2"]
        assert 0.80 < d2_ratio < 1.20, \
            f"D2 ratio={d2_ratio:.2f} — affinity law violated"

    @pytest.mark.parametrize("Q,H,n", [
        (0.001, 5.0,   1500.0),   # small pump
        (2.0,   8.0,   980.0),    # large low-head
        (0.1,   50.0,  1750.0),   # mid-range
        (0.02,  200.0, 3000.0),   # high-head multi-stage candidate
    ])
    def test_various_operating_points(self, Q, H, n):
        inp = {"Q": Q, "H": H, "n": n, "rho": 998.0, "nu": 1.004e-6}
        r = client.post("/sizing/run", json=inp)
        assert r.status_code == 200, f"Q={Q} H={H} n={n}: {r.text}"
        body = r.json()
        assert 0.2 < body["eta_total"] < 0.99


# ===========================================================================
# /surrogate/predict
# ===========================================================================

class TestSurrogatePredict:
    def test_returns_200_or_503(self):
        """Accept both: model loaded (200) or model not trained yet (503)."""
        r = client.post("/surrogate/predict", json=SURROGATE_VALID)
        assert r.status_code in (200, 503), r.text

    def test_valid_prediction_schema(self):
        r = client.post("/surrogate/predict", json=SURROGATE_VALID)
        if r.status_code == 503:
            pytest.skip("Surrogate model not available")
        body = r.json()
        for field in ["eta_hid", "eta_total", "H", "P_shaft",
                      "confidence", "surrogate_version", "latency_ms"]:
            assert field in body, f"Missing field: {field}"

    def test_prediction_plausible(self):
        r = client.post("/surrogate/predict", json=SURROGATE_VALID)
        if r.status_code == 503:
            pytest.skip("Surrogate model not available")
        body = r.json()
        assert 30 < body["eta_hid"] < 100, f"eta_hid={body['eta_hid']}"
        assert 0 <= body["confidence"] <= 1, f"confidence={body['confidence']}"
        assert body["latency_ms"] >= 0

    def test_invalid_negative_Ns(self):
        bad = {**SURROGATE_VALID, "Ns": -5.0}
        r = client.post("/surrogate/predict", json=bad)
        # Accept 422 (validation) or 503 (no model) — NOT 200 with garbage
        assert r.status_code in (422, 503), r.text

    def test_version_tag(self):
        r = client.post("/surrogate/predict", json=SURROGATE_VALID)
        if r.status_code == 503:
            pytest.skip("Surrogate model not available")
        version = r.json()["surrogate_version"]
        assert version.startswith("v"), f"Bad version: {version}"

    def test_multistage_accepted(self):
        inp = {**SURROGATE_VALID, "n_stages": 3, "H": 90.0}
        r = client.post("/surrogate/predict", json=inp)
        assert r.status_code in (200, 503), r.text


# ===========================================================================
# /surrogate/similar
# ===========================================================================

class TestSurrogateSimilar:
    def test_returns_200(self):
        r = client.get("/surrogate/similar", params={"ns": 35.0, "d2_mm": 300.0})
        assert r.status_code == 200, r.text

    def test_response_is_list(self):
        body = client.get("/surrogate/similar", params={"ns": 35.0, "d2_mm": 300.0}).json()
        assert isinstance(body, list)

    def test_limit_respected(self):
        body = client.get("/surrogate/similar", params={
            "ns": 35.0, "d2_mm": 300.0, "limit": 3
        }).json()
        assert len(body) <= 3

    def test_result_schema(self):
        body = client.get("/surrogate/similar", params={"ns": 35.0, "d2_mm": 300.0}).json()
        for item in body:
            assert "ns" in item
            assert "d2_mm" in item
            assert "eta_total" in item
            assert "fonte" in item
            assert "qualidade" in item

    def test_quality_filter(self):
        """min_quality param should be accepted without error."""
        r = client.get("/surrogate/similar", params={
            "ns": 35.0, "d2_mm": 300.0, "min_quality": 0.9
        })
        assert r.status_code == 200

    def test_missing_ns_returns_422(self):
        r = client.get("/surrogate/similar", params={"d2_mm": 300.0})
        assert r.status_code == 422

    def test_missing_d2_returns_422(self):
        r = client.get("/surrogate/similar", params={"ns": 35.0})
        assert r.status_code == 422


# ===========================================================================
# /docs — OpenAPI spec available
# ===========================================================================

class TestDocs:
    def test_openapi_json(self):
        r = client.get("/openapi.json")
        assert r.status_code == 200
        body = r.json()
        assert "paths" in body
        assert "/sizing/run" in body["paths"]
        assert "/surrogate/predict" in body["paths"]
        assert "/surrogate/similar" in body["paths"]
        assert "/health" in body["paths"]

    def test_docs_page(self):
        r = client.get("/docs")
        assert r.status_code == 200
