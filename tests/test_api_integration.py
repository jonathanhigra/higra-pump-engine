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
# ===========================================================================
# /geometry/run
# ===========================================================================

class TestGeometryRun:
    def test_valid_request_200(self):
        r = client.post("/geometry/run", json=SIZING_VALID)
        assert r.status_code == 200, r.text

    def test_response_schema(self):
        body = client.post("/geometry/run", json=SIZING_VALID).json()
        assert "params" in body
        assert "meridional_hub_r_mm" in body
        assert "meridional_shroud_r_mm" in body
        assert "blade_camber_r_mm" in body
        assert "cad_available" in body
        assert "warnings" in body
        assert "generation_time_ms" in body

    def test_params_fields(self):
        params = client.post("/geometry/run", json=SIZING_VALID).json()["params"]
        for field in ["D2_mm", "D1_mm", "b2_mm", "beta1_deg", "beta2_deg",
                      "blade_count", "blade_thickness_mm", "wrap_angle_deg"]:
            assert field in params, f"Missing params field: {field}"

    def test_geometry_physically_plausible(self):
        body = client.post("/geometry/run", json=SIZING_VALID).json()
        p = body["params"]

        # D2 > D1 > D1_hub
        assert p["D2_mm"] > p["D1_mm"] > p["D1_hub_mm"] > 0, \
            f"Diameter ordering violated: {p}"

        # b2 reasonable
        assert 0 < p["b2_mm"] < p["D2_mm"], f"b2={p['b2_mm']} out of range"

        # Blade angles physical range
        assert 5 < p["beta1_deg"] < 80
        assert 5 < p["beta2_deg"] < 60

        # Blade count 3–10
        assert 3 <= p["blade_count"] <= 10

        # Wrap angle for centrifugal: typically 60°–140°
        assert 20 < p["wrap_angle_deg"] < 200, \
            f"Wrap angle = {p['wrap_angle_deg']:.1f}° implausible"

    def test_meridional_profile_has_points(self):
        body = client.post("/geometry/run", json=SIZING_VALID).json()
        assert len(body["meridional_hub_r_mm"]) >= 5
        assert len(body["meridional_shroud_r_mm"]) == len(body["meridional_hub_r_mm"])
        # Radial coordinates must be positive
        assert all(r > 0 for r in body["meridional_hub_r_mm"])

    def test_blade_profile_has_points(self):
        body = client.post("/geometry/run", json=SIZING_VALID).json()
        assert len(body["blade_camber_r_mm"]) >= 5
        assert len(body["blade_camber_theta_deg"]) == len(body["blade_camber_r_mm"])

    def test_blade_r_monotonic(self):
        """Blade camber r should monotonically increase (inlet → outlet)."""
        r_pts = client.post("/geometry/run", json=SIZING_VALID).json()["blade_camber_r_mm"]
        for i in range(len(r_pts) - 1):
            assert r_pts[i] < r_pts[i + 1], \
                f"Blade r not monotonic at index {i}: {r_pts[i]:.2f} >= {r_pts[i+1]:.2f}"

    def test_cad_available_field_is_bool(self):
        body = client.post("/geometry/run", json=SIZING_VALID).json()
        assert isinstance(body["cad_available"], bool)

    def test_warnings_is_list(self):
        body = client.post("/geometry/run", json=SIZING_VALID).json()
        assert isinstance(body["warnings"], list)

    def test_invalid_Q_returns_422(self):
        r = client.post("/geometry/run", json={**SIZING_VALID, "Q": -0.01})
        assert r.status_code == 422

    def test_high_ns_mixed_flow(self):
        """High Ns (mixed-flow range) should still produce valid geometry."""
        inp = {"Q": 0.5, "H": 12.0, "n": 1450.0, "rho": 998.0, "nu": 1.004e-6}
        r = client.post("/geometry/run", json=inp)
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("Q,H,n", [
        (0.01, 20.0, 1750.0),
        (0.2,  40.0, 1450.0),
        (1.0,  10.0,  980.0),
    ])
    def test_parametric_variety(self, Q, H, n):
        inp = {"Q": Q, "H": H, "n": n, "rho": 998.0, "nu": 1.004e-6}
        r = client.post("/geometry/run", json=inp)
        assert r.status_code == 200, f"Q={Q} H={H} n={n}: {r.text}"


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
        assert "/geometry/run" in body["paths"]
        assert "/surrogate/predict" in body["paths"]
        assert "/surrogate/similar" in body["paths"]
        assert "/health" in body["paths"]

    def test_docs_page(self):
        r = client.get("/docs")
        assert r.status_code == 200
