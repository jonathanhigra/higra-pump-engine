"""Smoke tests para Fases 17-20 — paridade Ansys CFD.

Todos os testes rodam sem OpenFOAM/SU2 instalado.  Validam apenas que:
  - Os módulos importam
  - As funções principais retornam objetos com a estrutura esperada
  - Os writers criam arquivos no disco quando recebem paths válidos
  - Os endpoints respondem 200 com JSON válido
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def fake_sizing():
    """SizingResult mínimo genérico para todas as fases."""
    s = MagicMock()
    s.beta1 = 25.0; s.beta2 = 22.0
    s.d2 = 0.30; s.d1 = 0.15; s.b2 = 0.02
    s.impeller_d2 = 0.30; s.impeller_d1 = 0.15; s.impeller_b2 = 0.02
    s.blade_count = 6; s.specific_speed_nq = 25.0
    s.estimated_efficiency = 0.80
    s.estimated_power = 15000.0
    s.estimated_npsh_r = 2.5
    s.sigma = 0.12
    s.H = 30.0; s.Q = 0.05; s.n = 1750.0
    return s


@pytest.fixture()
def fake_op():
    from hpe.core.models import OperatingPoint
    return OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750.0)


# ===========================================================================
# Fase 17 — paridade física
# ===========================================================================

class TestPhase17:
    def test_multi_domain_imports(self):
        from hpe.cfd.openfoam.multi_domain import MultiDomainCase, build_multi_domain_case
        assert callable(build_multi_domain_case)

    def test_cavitation_config_water(self):
        from hpe.cfd.openfoam.cavitation_case import ZGBConfig
        cfg = ZGBConfig.water_at(20.0)
        assert cfg.p_sat > 2000     # ~ 2339 Pa for water @ 20°C
        assert cfg.p_sat < 3000
        assert cfg.rho_liquid > 990
        assert cfg.rho_vapor < 1.0

    def test_cavitation_config_hot_water(self):
        from hpe.cfd.openfoam.cavitation_case import ZGBConfig
        cfg_hot = ZGBConfig.water_at(80.0)
        cfg_cold = ZGBConfig.water_at(20.0)
        assert cfg_hot.p_sat > cfg_cold.p_sat * 10   # ~ 47×  at 80°C

    def test_prism_layers_yplus_targeting(self):
        from hpe.cfd.mesh.prism_layers import compute_prism_layer_config

        cfg = compute_prism_layer_config(
            u_ref=10.0, l_ref=0.3, nu=1e-6,
            target_yplus=1.0, expansion_ratio=1.2,
        )
        assert cfg.n_layers >= 5
        assert cfg.first_layer_thickness > 0
        assert cfg.first_layer_thickness < 1e-3   # sub-mm
        assert cfg.total_thickness > cfg.first_layer_thickness
        assert cfg.expansion_ratio == 1.2

    def test_prism_layers_snappy_dict_entry(self):
        from hpe.cfd.mesh.prism_layers import compute_prism_layer_config
        cfg = compute_prism_layer_config(u_ref=10.0, l_ref=0.3, nu=1e-6)
        text = cfg.to_snappy_dict_entry(cell_core_size=0.005)
        assert "addLayersControls" in text
        assert "nSurfaceLayers" in text
        assert "firstLayerThickness" in text

    def test_yplus_target_per_model(self):
        from hpe.cfd.mesh.prism_layers import yplus_target_for_model
        assert yplus_target_for_model("kOmegaSST") == 1.0
        assert yplus_target_for_model("kEpsilon") == 30.0
        assert yplus_target_for_model("kOmegaSSTLM") == 0.5

    def test_spanwise_loading_estimated(self, fake_op, tmp_path):
        from hpe.cfd.results.spanwise_loading import extract_spanwise_loading
        result = extract_spanwise_loading(
            case_dir=tmp_path,
            op=fake_op,
            spans=[0.1, 0.5, 0.9],
        )
        assert result.source == "estimated"
        assert len(result.by_span) == 3
        assert 0.5 in result.by_span
        assert result.by_span[0.5].loading_peak > 0

    def test_spanwise_tip_clearance_indicator(self, fake_op, tmp_path):
        from hpe.cfd.results.spanwise_loading import extract_spanwise_loading
        result = extract_spanwise_loading(
            case_dir=tmp_path, op=fake_op, spans=[0.1, 0.5, 0.9],
        )
        ind = result.tip_clearance_indicator()
        assert 0.0 <= ind <= 1.0


# ===========================================================================
# Fase 18 — visualização
# ===========================================================================

class TestPhase18:
    def test_vtk_export_fallback_synthetic(self, tmp_path):
        from hpe.cfd.postprocessing.vtk_export import export_field
        # Make a minimal time directory
        t_dir = tmp_path / "0"
        t_dir.mkdir()
        result = export_field(tmp_path, fields=["U", "p"])
        assert result.available
        assert result.json_path is not None
        assert result.json_path.exists()

    def test_q_criterion_zero_input(self):
        from hpe.cfd.postprocessing.field_features import compute_q_criterion
        data = {
            "grid": [2, 2, 2],
            "bounding_box": {"min": [0, 0, 0], "max": [1, 1, 1]},
            "fields": {"U": [1.0] * 8},
            "points": [],
        }
        q = compute_q_criterion(data)
        assert q.grid_shape == (2, 2, 2)
        assert len(q.values) == 8 or len(q.values) == 0  # numpy availability

    def test_loss_audit_fallback_denton(self, fake_sizing, tmp_path):
        from hpe.cfd.postprocessing.loss_audit import audit_losses_from_cfd
        result = audit_losses_from_cfd(tmp_path, fake_sizing)
        assert result.source == "estimated"
        assert "profile" in result.zones
        assert "secondary" in result.zones
        assert "tip" in result.zones
        assert result.total_loss_power_W > 0

    def test_loss_audit_largest_zone(self, fake_sizing, tmp_path):
        from hpe.cfd.postprocessing.loss_audit import audit_losses_from_cfd
        result = audit_losses_from_cfd(tmp_path, fake_sizing)
        largest = result.largest_zone()
        assert largest in result.zones

    def test_turbo_views_importable(self):
        from hpe.cfd.postprocessing.turbo_views import (
            extract_meridional_average, extract_blade_to_blade,
        )
        assert callable(extract_meridional_average)
        assert callable(extract_blade_to_blade)


# ===========================================================================
# Fase 19 — transiente + ruído
# ===========================================================================

class TestPhase19:
    def test_transient_config_defaults(self):
        from hpe.cfd.openfoam.transient import TransientConfig
        cfg = TransientConfig()
        assert cfg.end_time > 0
        assert cfg.write_interval > 0
        assert cfg.max_co >= 1.0

    def test_pulsations_synthetic_spectrum(self, tmp_path):
        from hpe.cfd.postprocessing.pulsations import analyze_probes
        result = analyze_probes(tmp_path, rpm=1750, blade_count=6)
        assert result.source == "estimated"
        assert result.bpf_hz == pytest.approx(6 * 1750 / 60, rel=1e-3)
        if result.spectra:
            assert result.spectra[0].bpf_amplitude > 0

    def test_radial_forces_synthetic(self, fake_sizing, tmp_path):
        from hpe.cfd.postprocessing.radial_forces import analyze_radial_forces
        result = analyze_radial_forces(tmp_path, fake_sizing)
        assert result.source == "estimated"
        assert len(result.samples) > 0
        assert result.risk_level in ("safe", "marginal", "risky", "critical")

    def test_radial_forces_kr_positive(self, fake_sizing, tmp_path):
        from hpe.cfd.postprocessing.radial_forces import analyze_radial_forces
        result = analyze_radial_forces(tmp_path, fake_sizing)
        assert result.mean_kr >= 0
        assert result.max_kr >= result.mean_kr

    def test_transition_writers(self, tmp_path):
        from hpe.cfd.openfoam.transition_model import (
            write_transition_properties, write_gamma_field, write_reTheta_field,
        )
        (tmp_path / "0").mkdir()
        (tmp_path / "constant").mkdir()

        write_transition_properties(tmp_path)
        write_gamma_field(tmp_path)
        write_reTheta_field(tmp_path, turbulence_intensity=0.05)

        assert (tmp_path / "constant" / "turbulenceProperties").exists()
        assert (tmp_path / "0" / "gammaInt").exists()
        assert (tmp_path / "0" / "ReThetat").exists()

        text = (tmp_path / "constant" / "turbulenceProperties").read_text()
        assert "kOmegaSSTLM" in text


# ===========================================================================
# Fase 20 — workflow avançado
# ===========================================================================

class TestPhase20:
    def test_morph_config_defaults(self):
        from hpe.cfd.openfoam.morph import MorphConfig
        cfg = MorphConfig()
        assert cfg.solver == "displacementLaplacian"

    def test_morph_mesh_writes_files(self, fake_sizing, tmp_path):
        from hpe.cfd.openfoam.morph import morph_mesh, MorphConfig
        # Prepare minimal case dir
        (tmp_path / "0").mkdir()
        (tmp_path / "constant").mkdir()
        (tmp_path / "system").mkdir()
        (tmp_path / "system" / "fvSolution").write_text("solvers\n{\n}\n")

        result = morph_mesh(
            case_dir=tmp_path,
            design_deltas={"beta2": 0.5, "d2": 0.002},
            sizing=fake_sizing,
            config=MorphConfig(),
        )
        assert result.morphed
        assert result.max_displacement >= 0
        assert (tmp_path / "constant" / "dynamicMeshDict").exists()
        assert (tmp_path / "0" / "pointDisplacement").exists()

    def test_multi_stage_builds(self, fake_sizing, tmp_path):
        from hpe.cfd.openfoam.multi_stage import StageConfig
        stages = [StageConfig(sizing=fake_sizing) for _ in range(3)]
        assert len(stages) == 3
        # Full build is too heavy for unit test; just validate the dataclass

    def test_benchmarks_list(self):
        from hpe.validation.benchmarks import list_benchmarks
        benchmarks = list_benchmarks()
        assert len(benchmarks) >= 3
        names = {b.name for b in benchmarks}
        assert "shf_centrifugal" in names

    def test_benchmarks_load_by_name(self):
        from hpe.validation.benchmarks import load_benchmark
        shf = load_benchmark("shf_centrifugal")
        assert shf.rpm == 1710
        assert shf.n_blades == 7
        assert len(shf.points) > 0
        assert shf.bep is not None

    def test_benchmarks_load_missing_raises(self):
        from hpe.validation.benchmarks import load_benchmark
        with pytest.raises(KeyError):
            load_benchmark("nonexistent_case")

    def test_benchmark_validate(self):
        from hpe.validation.benchmarks import load_benchmark
        shf = load_benchmark("shf_centrifugal")

        # Trivial exact match → MAPE 0
        def head_fn(Q: float) -> float:
            for pt in shf.points:
                if abs(pt.Q - Q) < 1e-6:
                    return pt.H
            return 0.0

        def eta_fn(Q: float) -> float:
            for pt in shf.points:
                if abs(pt.Q - Q) < 1e-6:
                    return pt.eta
            return 0.0

        result = shf.validate(head_fn, eta_fn)
        assert result.mape_head == pytest.approx(0.0, abs=1e-6)
        assert result.mape_efficiency == pytest.approx(0.0, abs=1e-6)
        assert result.passed

    def test_report_markdown_fallback(self, tmp_path):
        from hpe.reports.generator import generate_report, ReportContext
        ctx = ReportContext(
            project_name="Test Pump",
            sizing={"Q": 0.05, "H": 30.0, "n": 1750, "impeller_d2": 0.30,
                    "estimated_efficiency": 0.80, "estimated_power": 15000},
            cavitation={"npsh_r": 2.5, "npsh_a": 5.0, "risk_level": "safe",
                        "recommendations": ["Test rec"]},
        )
        path = generate_report(ctx, tmp_path / "report", format="markdown")
        assert path.exists()
        assert path.suffix == ".md"
        text = path.read_text()
        assert "Test Pump" in text


# ===========================================================================
# API smoke tests — endpoints phases 17-20
# ===========================================================================

class TestPhase1720Endpoints:
    @pytest.fixture(autouse=True)
    def _mock(self, fake_sizing):
        with patch("hpe.api.routes.phase_17_20_routes._sizing_from_op", return_value=fake_sizing):
            yield

    def _client(self):
        from fastapi.testclient import TestClient
        from hpe.api.app import app
        return TestClient(app)

    def test_prism_layers_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/cfd/advanced/prism_layers", json={
            "u_ref": 10.0, "l_ref": 0.3, "nu": 1e-6, "target_yplus": 1.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "n_layers" in data
        assert "first_layer_thickness" in data

    def test_spanwise_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/cfd/advanced/spanwise", json={
            "flow_rate": 0.05, "head": 30.0, "rpm": 1750, "spans": [0.1, 0.5, 0.9],
        })
        assert resp.status_code == 200

    def test_loss_audit_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/cfd/advanced/loss_audit", json={
            "flow_rate": 0.05, "head": 30.0, "rpm": 1750,
        })
        assert resp.status_code == 200
        assert "zones" in resp.json()

    def test_radial_forces_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/cfd/advanced/radial_forces", json={
            "flow_rate": 0.05, "head": 30.0, "rpm": 1750,
        })
        assert resp.status_code == 200
        assert "risk_level" in resp.json()

    def test_pulsations_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/cfd/advanced/pulsations", json={
            "rpm": 1750, "blade_count": 6,
        })
        assert resp.status_code == 200
        assert "bpf_hz" in resp.json()

    def test_benchmarks_list_endpoint(self):
        client = self._client()
        resp = client.get("/api/v1/cfd/advanced/benchmarks")
        assert resp.status_code == 200
        data = resp.json()
        assert "benchmarks" in data
        assert len(data["benchmarks"]) >= 3

    def test_benchmarks_run_endpoint(self):
        client = self._client()
        resp = client.post("/api/v1/cfd/advanced/benchmarks/run", json={"method": "meanline"})
        assert resp.status_code == 200
        data = resp.json()
        assert "n_benchmarks" in data
        assert "results" in data

    def test_report_endpoint_markdown(self):
        client = self._client()
        resp = client.post("/api/v1/cfd/advanced/report", json={
            "project_name": "Test",
            "format": "markdown",
            "sizing": {"Q": 0.05, "H": 30.0, "n": 1750, "impeller_d2": 0.3,
                       "estimated_efficiency": 0.80, "estimated_power": 15000},
        })
        assert resp.status_code == 200
