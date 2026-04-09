"""Smoke tests for round-3 50 improvements (#1-50).

Cobre módulos críticos das melhorias adicionadas em uma única rodada:
físicas (#1-10), endpoints (#11-20), extractors (#21-25),
otimização (#26-30), infra (#41-45) e CLI (#46-48).
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Bloco A: physics calculators (#1-10)
# ---------------------------------------------------------------------------

class TestPhysicsCalculators:
    def test_slip_factors_three_models(self):
        from hpe.physics.loss_correlations import compute_slip_factors
        r = compute_slip_factors(n_blades=6, beta2_deg=22.5, d1_d2_ratio=0.5)
        assert 0.5 < r.wiesner < 1.0
        assert 0.5 < r.stodola < 1.0
        assert 0.5 < r.stanitz < 1.0
        assert r.recommended == "wiesner"

    def test_slip_factor_high_blade_count(self):
        from hpe.physics.loss_correlations import compute_slip_factors
        r6 = compute_slip_factors(n_blades=6, beta2_deg=22.5)
        r12 = compute_slip_factors(n_blades=12, beta2_deg=22.5)
        # More blades → less slip → higher slip factor
        assert r12.wiesner > r6.wiesner

    def test_disk_friction_regimes(self):
        from hpe.physics.loss_correlations import compute_disk_friction
        r = compute_disk_friction(d2=0.30, rpm=1750)
        assert r.power_loss_W > 0
        assert r.regime in ("laminar", "transitional", "turbulent_merged", "turbulent_separated")

    def test_volumetric_efficiency_range(self):
        from hpe.physics.loss_correlations import compute_volumetric_efficiency
        r = compute_volumetric_efficiency(Q=0.05, H=30, d_seal=0.15)
        assert 0 < r.eta_v <= 1.0
        assert r.leakage_flow >= 0

    def test_mechanical_efficiency_decreases_with_load(self):
        from hpe.physics.loss_correlations import compute_mechanical_efficiency
        r1 = compute_mechanical_efficiency(P_hydraulic=10000, rpm=1750)
        r2 = compute_mechanical_efficiency(P_hydraulic=100000, rpm=1750)
        assert 0 < r1.eta_m <= 1
        assert 0 < r2.eta_m <= 1
        # Higher P → bearing loss scales linearly so eta_m higher
        assert r2.eta_m >= r1.eta_m

    def test_affinity_laws_doubling_speed(self):
        from hpe.physics.loss_correlations import apply_affinity_laws
        r = apply_affinity_laws(
            Q_old=0.05, H_old=30, P_old=15000, eta_old=0.80,
            n_old=1750, n_new=3500,
            apply_re_correction=False,
        )
        assert r.Q_new == pytest.approx(0.10, rel=0.01)   # 2×
        assert r.H_new == pytest.approx(120, rel=0.01)    # 4×
        assert r.P_new == pytest.approx(120000, rel=0.01) # 8×

    def test_suction_specific_speed(self):
        from hpe.physics.loss_correlations import compute_suction_specific_speed
        nss = compute_suction_specific_speed(Q=0.05, npsh_r=3.0, rpm=1750)
        assert nss > 0

    def test_specific_diameter_cordier(self):
        from hpe.physics.loss_correlations import (
            compute_specific_diameter, compute_specific_speed_omega,
        )
        ds = compute_specific_diameter(D2=0.30, H=30, Q=0.05)
        ws = compute_specific_speed_omega(Q=0.05, H=30, rpm=1750)
        assert ds > 0
        assert ws > 0

    def test_reynolds_correction_methods(self):
        from hpe.physics.loss_correlations import compute_reynolds_correction
        for m in ("moody", "ackeret", "pfleider"):
            eta = compute_reynolds_correction(0.80, 1e6, 1e7, method=m)
            assert eta > 0.80   # higher Re → higher eta

    def test_meridional_curvature_smoothness(self):
        from hpe.physics.loss_correlations import analyze_meridional_curvature
        # Linear (zero curvature)
        hub = [(i * 0.01, i * 0.005) for i in range(20)]
        shroud = [(i * 0.01, i * 0.005 + 0.05) for i in range(20)]
        r = analyze_meridional_curvature(hub, shroud)
        assert r.quality_score > 0.9   # very smooth


# ---------------------------------------------------------------------------
# Bloco C: extractors (#21-25)
# ---------------------------------------------------------------------------

class TestExtractors:
    def test_htc_dittus_boelter(self, tmp_path):
        from hpe.cfd.postprocessing.field_extractors import extract_htc
        r = extract_htc(tmp_path, u_ref=10.0, l_ref=0.3)
        assert r.htc_avg > 0
        assert r.nusselt_avg > 0

    def test_wall_shear_correlation(self, tmp_path):
        from hpe.cfd.postprocessing.field_extractors import extract_wall_shear
        r = extract_wall_shear(tmp_path, u_ref=10.0, l_ref=0.3)
        assert r.tau_w_avg > 0
        assert r.cf_avg > 0

    def test_yplus_stats_synthetic(self, tmp_path):
        from hpe.cfd.postprocessing.field_extractors import extract_yplus_stats
        r = extract_yplus_stats(tmp_path)
        assert r.yplus_min > 0
        assert r.yplus_max > r.yplus_min
        assert 0 <= r.pct_below_1 <= 1
        assert len(r.histogram) == 20

    def test_mass_flow_check_balanced(self):
        from hpe.cfd.postprocessing.field_extractors import check_mass_flow_conservation
        r = check_mass_flow_conservation(Q=0.05)
        assert r.imbalance_pct < 0.5
        assert r.converged

    def test_cp_field_synthetic(self, tmp_path):
        from hpe.cfd.postprocessing.field_extractors import extract_cp_field
        r = extract_cp_field(tmp_path, u_ref=10.0)
        assert r.cp_min < 0   # suction peak
        assert r.cp_max >= 0
        assert r.n_negative > 0


# ---------------------------------------------------------------------------
# Bloco D: optimization (#26-30)
# ---------------------------------------------------------------------------

class TestOptimizationEnhancements:
    def test_crowding_distance_extremes_infinite(self):
        from hpe.optimization.enhancements import crowding_distance
        pop = [
            {"f1": 1.0, "f2": 5.0},
            {"f1": 2.0, "f2": 4.0},
            {"f1": 3.0, "f2": 3.0},
            {"f1": 4.0, "f2": 2.0},
            {"f1": 5.0, "f2": 1.0},
        ]
        d = crowding_distance(pop, ["f1", "f2"])
        assert len(d) == 5
        # Extremes get infinity
        assert d[0] == float("inf")
        assert d[4] == float("inf")

    def test_constraint_handler_penalty(self):
        from hpe.optimization.enhancements import ConstraintHandler, Constraint
        h = ConstraintHandler([
            Constraint(name="x_max", fn=lambda x: x.get("x", 0) - 10),
        ])
        f, viol = h.evaluate({"x": 15}, fitness=0.0)
        assert f > 0   # penalty added
        assert viol[0] == 5

    def test_constraint_handler_repair(self):
        from hpe.optimization.enhancements import ConstraintHandler
        h = ConstraintHandler()
        out = h.repair({"x": -5, "y": 100}, bounds={"x": (0, 10), "y": (0, 50)})
        assert out["x"] == 0
        assert out["y"] == 50

    def test_optimization_checkpoint_roundtrip(self, tmp_path):
        from hpe.optimization.enhancements import OptimizationCheckpoint
        cp = OptimizationCheckpoint(
            run_id="abc", iteration=5,
            population=[{"x": 1}, {"x": 2}],
            best_fitness=0.5,
            best_individual={"x": 1.5},
        )
        path = tmp_path / "ckpt.json"
        cp.save(path)
        loaded = OptimizationCheckpoint.load(path)
        assert loaded.run_id == "abc"
        assert loaded.iteration == 5
        assert loaded.best_fitness == 0.5

    def test_active_learning_max_uncertainty(self):
        from hpe.optimization.enhancements import active_learning_query
        pool = [{"x": i} for i in range(10)]
        # Higher x → higher uncertainty
        def predict(x):
            return 0.0, x["x"] * 0.1

        result = active_learning_query(pool, predict, n_select=3, strategy="max_uncertainty")
        assert len(result.selected) == 3
        # Should select x=9, 8, 7 (highest σ)
        selected_x = [s["x"] for s in result.selected]
        assert 9 in selected_x

    def test_auto_tune_surrogate(self):
        from hpe.optimization.enhancements import auto_tune_surrogate
        # Score = -(depth - 5)² (max at depth=5)
        space = {"depth": [3, 5, 7, 9]}
        result = auto_tune_surrogate(
            score_fn=lambda p: -((p["depth"] - 5) ** 2),
            param_space=space, n_trials=20,
        )
        assert result.best_params["depth"] == 5
        assert result.best_score == 0


# ---------------------------------------------------------------------------
# Bloco F: infra endpoints (#41-45)
# ---------------------------------------------------------------------------

class TestInfraEndpoints:
    def _client(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app
        return TestClient(app)

    def test_health_deep_returns_components(self):
        client = self._client()
        resp = client.get("/health/deep")
        assert resp.status_code == 200
        data = resp.json()
        assert "components" in data
        assert "uptime_s" in data
        assert "openfoam" in data["components"]

    def test_metrics_prometheus_format(self):
        client = self._client()
        resp = client.get("/metrics")
        assert resp.status_code == 200
        text = resp.text
        assert "hpe_uptime_seconds" in text
        assert "hpe_requests_total" in text
        assert "# HELP" in text
        assert "# TYPE" in text

    def test_error_codes_listed(self):
        client = self._client()
        resp = client.get("/api/v1/error_codes")
        assert resp.status_code == 200
        codes = {c["code"] for c in resp.json()["codes"]}
        assert "VALIDATION_FAILED" in codes
        assert "CFD_DIVERGED" in codes


# ---------------------------------------------------------------------------
# JsonFormatter logging test (#43)
# ---------------------------------------------------------------------------

class TestStructuredLogging:
    def test_json_formatter_emits_valid_json(self):
        import json
        import logging
        from hpe.core.logging_config import JsonFormatter

        f = JsonFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="x.py", lineno=1,
            msg="hello %s", args=("world",), exc_info=None,
        )
        out = f.format(record)
        parsed = json.loads(out)
        assert parsed["level"] == "INFO"
        assert parsed["msg"] == "hello world"
        assert parsed["logger"] == "test"


# ---------------------------------------------------------------------------
# Physics endpoints (#16-20)
# ---------------------------------------------------------------------------

class TestPhysicsEndpoints:
    def _client(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app
        return TestClient(app)

    def test_slip_factor_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/physics/slip_factor", json={
            "n_blades": 6, "beta2_deg": 22.5, "d1_d2_ratio": 0.5,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "wiesner" in data and 0 < data["wiesner"] < 1

    def test_affinity_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/physics/affinity_scaling", json={
            "Q_old": 0.05, "H_old": 30, "P_old": 15000, "eta_old": 0.8,
            "n_old": 1750, "n_new": 2900,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["Q_new_m3s"] > 0.05  # higher rpm → higher Q

    def test_disk_friction_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/physics/disk_friction", json={
            "d2": 0.30, "rpm": 1750,
        })
        assert resp.status_code == 200
        assert resp.json()["power_loss_W"] > 0

    def test_nss_endpoint_safety_classification(self):
        client = self._client()
        resp = client.post("/api/v1/physics/nss", json={
            "Q": 0.05, "npsh_r": 3.0, "rpm": 1750,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["nss"] > 0
        assert data["safety"] in ("conservative", "industry", "aggressive")
