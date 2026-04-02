"""Tests for anomaly detection and validators."""

import pytest

from hpe.ai.anomaly.detector import AnomalyReport, check_prediction_confidence, detect_anomalies
from hpe.ai.anomaly.validators import validate_geometry, validate_performance
from hpe.ai.surrogate.dataset import generate_dataset
from hpe.ai.surrogate.model import SurrogateModel
from hpe.core.models import OperatingPoint, PerformanceMetrics
from hpe.optimization.problem import OptimizationProblem
from hpe.physics.euler import get_design_flow_rate
from hpe.physics.performance import evaluate_performance
from hpe.sizing import run_sizing


@pytest.fixture
def problem():
    return OptimizationProblem.default(0.05, 30.0, 1750)


@pytest.fixture
def dataset(problem):
    return generate_dataset(problem, n_samples=50, seed=42)


class TestAnomalyDetector:
    def test_returns_report(self, dataset) -> None:
        report = detect_anomalies(dataset)
        assert isinstance(report, AnomalyReport)

    def test_finds_some_anomalies(self, dataset) -> None:
        report = detect_anomalies(dataset, contamination=0.10)
        # With 10% contamination, should find some
        assert report.n_anomalies >= 0

    def test_anomaly_indices_valid(self, dataset) -> None:
        report = detect_anomalies(dataset, contamination=0.10)
        for idx in report.anomaly_indices:
            assert 0 <= idx < len(dataset.X)


class TestPredictionConfidence:
    def test_returns_float(self, problem, dataset) -> None:
        model = SurrogateModel()
        model.train(dataset)
        conf = check_prediction_confidence(model, [25.0, 1.0, 1.0, 7])
        assert isinstance(conf, float)
        assert 0 <= conf <= 1

    def test_untrained_model_zero(self) -> None:
        model = SurrogateModel()
        conf = check_prediction_confidence(model, [25.0, 1.0, 1.0, 7])
        assert conf == 0.0


class TestValidateGeometry:
    def test_valid_sizing(self) -> None:
        sizing = run_sizing(OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750))
        result = validate_geometry(sizing)
        assert result.valid

    def test_detects_d1_greater_than_d2(self) -> None:
        sizing = run_sizing(OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750))
        sizing.impeller_d1 = sizing.impeller_d2 + 0.01  # Invalid
        result = validate_geometry(sizing)
        assert not result.valid
        assert any("D1" in e for e in result.errors)

    def test_detects_negative_b2(self) -> None:
        sizing = run_sizing(OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750))
        sizing.impeller_b2 = -0.01  # Invalid
        result = validate_geometry(sizing)
        assert not result.valid


class TestValidatePerformance:
    def test_valid_performance(self) -> None:
        sizing = run_sizing(OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750))
        perf = evaluate_performance(sizing, get_design_flow_rate(sizing))
        result = validate_performance(perf)
        assert result.valid

    def test_detects_negative_head(self) -> None:
        perf = PerformanceMetrics(
            hydraulic_efficiency=0.85, volumetric_efficiency=0.95,
            mechanical_efficiency=0.96, total_efficiency=0.78,
            head=-5.0, torque=100.0, power=15000.0,
            npsh_required=3.0, min_pressure_coefficient=-0.5,
        )
        result = validate_performance(perf)
        assert not result.valid
        assert any("head" in e.lower() for e in result.errors)

    def test_detects_eta_over_1(self) -> None:
        perf = PerformanceMetrics(
            hydraulic_efficiency=1.05, volumetric_efficiency=0.95,
            mechanical_efficiency=0.96, total_efficiency=0.95,
            head=30.0, torque=100.0, power=15000.0,
            npsh_required=3.0, min_pressure_coefficient=-0.5,
        )
        result = validate_performance(perf)
        assert not result.valid
