"""Testes da Fase 16 — adjoint loop, NPSHr-Q curve, cancel, adjoint endpoint.

Todos os testes rodam sem OpenFOAM instalado:
- adjoint_loop usa modo sintético quando SU2 não está no PATH
- endpoints CFD usam dry-run (run_solver=False)
- mock do run_sizing para desacoplar do banco
"""

from __future__ import annotations

import math
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def fake_sizing():
    """SizingResult mínimo compatível com adjoint_loop e cavitation."""
    s = MagicMock()
    s.beta1 = 25.0
    s.beta2 = 22.0
    s.d2 = 0.30
    s.d1 = 0.15
    s.b2 = 0.02
    s.blade_count = 6
    s.specific_speed_nq = 25.0
    s.impeller_d2 = 0.30
    s.impeller_b2 = 0.02
    s.estimated_efficiency = 0.80
    s.estimated_npsh_r = 2.5
    s.sigma = 0.12
    s.H = 30.0
    s.Q = 0.05
    s.n = 1750.0
    return s


# ---------------------------------------------------------------------------
# 1. adjoint_loop — synthetic mode (no SU2)
# ---------------------------------------------------------------------------

class TestAdjointLoop:
    def test_runs_synthetic_when_su2_missing(self, fake_sizing, tmp_path):
        from hpe.cfd.adjoint_loop import run_adjoint_loop, AdjointConfig

        config = AdjointConfig(
            max_iter=3,
            step_size=0.05,
            tol=1e-2,
            output_dir=str(tmp_path / "adjoint"),
        )

        with patch("hpe.cfd.adjoint_loop.su2_available", return_value=False):
            result = run_adjoint_loop(fake_sizing, tmp_path, config)

        assert result.n_iterations == 3  # ran all iters (tol high but synth doesn't converge that fast with seed)
        # Actually with seed=42 and scale decreasing, may converge — just check structure
        assert result.loop_id
        assert len(result.history) >= 1
        assert result.history[0].objective is not None

    def test_converges_when_gradient_below_tol(self, fake_sizing, tmp_path):
        from hpe.cfd.adjoint_loop import run_adjoint_loop, AdjointConfig

        # Very high tol so the first synthetic iter triggers convergence
        config = AdjointConfig(
            max_iter=10,
            step_size=0.01,
            tol=999.0,  # trivially converges first iter
            output_dir=str(tmp_path / "adjoint"),
        )

        with patch("hpe.cfd.adjoint_loop.su2_available", return_value=False):
            result = run_adjoint_loop(fake_sizing, tmp_path, config)

        assert result.converged is True
        assert result.n_iterations == 1

    def test_apply_deltas_respects_bounds(self, fake_sizing):
        from hpe.cfd.adjoint_loop import _apply_deltas, AdjointConfig

        config = AdjointConfig(
            design_vars=["beta2", "d2"],
            bounds={"beta2": (12.0, 40.0), "d2": (0.05, 1.0)},
        )
        # Delta that would push beta2 below lower bound
        deltas = {"beta2": -99.0, "d2": 0.01}
        modified = _apply_deltas(fake_sizing, deltas, config)

        assert modified.beta2 == 12.0       # clipped to lower bound
        assert abs(modified.d2 - 0.31) < 1e-9   # nominal 0.30 + 0.01

    def test_result_to_dict(self, fake_sizing, tmp_path):
        from hpe.cfd.adjoint_loop import run_adjoint_loop, AdjointConfig

        config = AdjointConfig(max_iter=2, output_dir=str(tmp_path / "a"))
        with patch("hpe.cfd.adjoint_loop.su2_available", return_value=False):
            result = run_adjoint_loop(fake_sizing, tmp_path, config)

        d = result.to_dict()
        assert "loop_id" in d
        assert "n_iterations" in d
        assert "history" in d
        assert isinstance(d["history"], list)


# ---------------------------------------------------------------------------
# 2. Cavitation endpoint — NPSHr-Q curve
# ---------------------------------------------------------------------------

class TestCavitationEndpoint:
    @pytest.fixture(autouse=True)
    def _mock_sizing(self, fake_sizing):
        with patch("hpe.api.routes.cfd_loop_routes.run_sizing", return_value=fake_sizing) as m:
            yield m

    def test_returns_npshq_curve(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app

        client = TestClient(app)
        resp = client.post("/api/v1/cfd/cavitation", json={
            "flow_rate": 0.05,
            "head": 30.0,
            "rpm": 1750.0,
            "npsh_available": 5.0,
            "flow_fractions": [0.5, 1.0, 1.3],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "npshq_curve" in data
        assert len(data["npshq_curve"]) == 3
        for pt in data["npshq_curve"]:
            assert "Q" in pt
            assert "npsh_r" in pt
            assert pt["npsh_r"] > 0

    def test_npshq_curve_sorted_by_fraction(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app

        client = TestClient(app)
        resp = client.post("/api/v1/cfd/cavitation", json={
            "flow_rate": 0.05,
            "head": 30.0,
            "rpm": 1750.0,
            "npsh_available": 4.0,
            "flow_fractions": [0.6, 0.8, 1.0, 1.2],
        })
        assert resp.status_code == 200
        fracs = [pt["fraction"] for pt in resp.json()["npshq_curve"]]
        assert fracs == sorted(fracs)

    def test_bep_fields_present(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app

        client = TestClient(app)
        resp = client.post("/api/v1/cfd/cavitation", json={
            "flow_rate": 0.05,
            "head": 30.0,
            "rpm": 1750.0,
            "npsh_available": 5.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        for key in ("npsh_r", "npsh_a", "margin", "risk_level", "recommendations"):
            assert key in data, f"Missing key: {key}"


# ---------------------------------------------------------------------------
# 3. CFD run cancellation
# ---------------------------------------------------------------------------

class TestCancelCFDRun:
    def test_cancel_nonexistent_run(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app

        client = TestClient(app)
        resp = client.delete("/api/v1/cfd/run/nonexistent_run_xyz")
        assert resp.status_code == 200
        assert resp.json()["cancelled"] is False
        assert resp.json()["status"] == "not_found"

    def test_cancel_registered_run(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app
        from hpe.api.routes.cfd_loop_routes import _runs

        # Register a fake run
        fake_run_id = "test_cancel_001"
        _runs[fake_run_id] = {
            "loop": MagicMock(),
            "sizing": MagicMock(),
            "status": "running",
            "results": None,
            "work_dir": Path("/tmp/fake_run"),
        }

        client = TestClient(app)
        with patch("hpe.cfd.openfoam.convergence.ConvergenceMonitor.write_stop_file"):
            resp = client.delete(f"/api/v1/cfd/run/{fake_run_id}")

        assert resp.status_code == 200
        assert resp.json()["cancelled"] is True
        assert _runs[fake_run_id]["status"] == "cancelled"

        # Cleanup
        del _runs[fake_run_id]

    def test_cancel_already_completed_run(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app
        from hpe.api.routes.cfd_loop_routes import _runs

        fake_run_id = "test_cancel_002"
        _runs[fake_run_id] = {
            "loop": MagicMock(), "sizing": MagicMock(),
            "status": "completed", "results": None,
            "work_dir": Path("/tmp/fake_run"),
        }

        client = TestClient(app)
        resp = client.delete(f"/api/v1/cfd/run/{fake_run_id}")
        assert resp.status_code == 200
        assert resp.json()["cancelled"] is False  # already done

        del _runs[fake_run_id]


# ---------------------------------------------------------------------------
# 4. Adjoint loop endpoint
# ---------------------------------------------------------------------------

class TestAdjointLoopEndpoint:
    @pytest.fixture(autouse=True)
    def _mock_deps(self, fake_sizing):
        with patch("hpe.api.routes.cfd_loop_routes.run_sizing", return_value=fake_sizing), \
             patch("hpe.cfd.adjoint_loop.su2_available", return_value=False):
            yield

    def test_adjoint_loop_endpoint_returns_history(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app

        client = TestClient(app)
        resp = client.post("/api/v1/cfd/adjoint/loop", json={
            "flow_rate": 0.05,
            "head": 30.0,
            "rpm": 1750.0,
            "max_iter": 2,
            "step_size": 0.02,
            "tol": 1e-3,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "loop_id" in data
        assert "n_iterations" in data
        assert "history" in data
        assert data["n_iterations"] >= 1

    def test_adjoint_loop_endpoint_design_vars_subset(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app

        client = TestClient(app)
        resp = client.post("/api/v1/cfd/adjoint/loop", json={
            "flow_rate": 0.05,
            "head": 30.0,
            "rpm": 1750.0,
            "max_iter": 1,
            "design_vars": ["beta2"],
        })
        assert resp.status_code == 200
        # history[0].deltas should only contain beta2
        hist = resp.json()["history"]
        assert len(hist) >= 1
        deltas = hist[0]["deltas"]
        assert all(k in ["beta2"] for k in deltas)


# ---------------------------------------------------------------------------
# 5. Adjoint loop unit — _compute_deltas and _build_adjoint_config
# ---------------------------------------------------------------------------

class TestAdjointHelpers:
    def test_compute_deltas_only_requested_vars(self):
        from hpe.cfd.adjoint_loop import _compute_deltas, AdjointConfig
        from hpe.cfd.su2.sensitivity import DesignSensitivities

        sens = DesignSensitivities(dbeta2_dJ=0.5, dD2_dJ=0.3, db2_dJ=0.1)
        config = AdjointConfig(design_vars=["beta2", "d2"], step_size=0.01)
        deltas = _compute_deltas(sens, config)

        assert "beta2" in deltas
        assert "d2" in deltas
        assert "b2" not in deltas  # not in design_vars

    def test_build_adjoint_config_sets_math_problem(self, tmp_path):
        from hpe.cfd.adjoint_loop import _build_adjoint_config

        direct_cfg = tmp_path / "direct.cfg"
        direct_cfg.write_text("MATH_PROBLEM= DIRECT\nOTHER= value\n")

        adj_cfg = _build_adjoint_config(direct_cfg, tmp_path / "adj")
        content = adj_cfg.read_text()

        assert "CONTINUOUS_ADJOINT" in content
        assert "DIRECT" not in content.split("CONTINUOUS_ADJOINT")[0].split("\n")[-1]
