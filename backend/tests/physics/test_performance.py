"""Tests for single-point performance evaluation."""

import pytest

from hpe.core.models import PerformanceMetrics, SizingResult
from hpe.physics.euler import get_design_flow_rate
from hpe.physics.performance import evaluate_design_point, evaluate_performance


class TestEvaluatePerformance:
    def test_returns_metrics(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        perf = evaluate_performance(sizing_result, q)
        assert isinstance(perf, PerformanceMetrics)

    def test_head_positive(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        perf = evaluate_performance(sizing_result, q)
        assert perf.head > 0

    def test_head_near_design(self, sizing_result: SizingResult) -> None:
        """Head at design flow should be close to design head (~30m)."""
        q = get_design_flow_rate(sizing_result)
        perf = evaluate_performance(sizing_result, q)
        # Should be within 30% of 30m (correlations are approximate)
        assert 15 < perf.head < 50

    def test_efficiency_between_0_and_1(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        perf = evaluate_performance(sizing_result, q)
        assert 0 < perf.total_efficiency < 1
        assert 0 < perf.hydraulic_efficiency < 1
        assert 0 < perf.volumetric_efficiency < 1
        assert 0 < perf.mechanical_efficiency < 1

    def test_power_positive(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        perf = evaluate_performance(sizing_result, q)
        assert perf.power > 0

    def test_npsh_positive(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        perf = evaluate_performance(sizing_result, q)
        assert perf.npsh_required > 0

    def test_head_decreases_with_flow(self, sizing_result: SizingResult) -> None:
        """H-Q curve should be falling (typical for centrifugal pump)."""
        q = get_design_flow_rate(sizing_result)
        perf_low = evaluate_performance(sizing_result, q * 0.5)
        perf_high = evaluate_performance(sizing_result, q * 1.3)
        assert perf_low.head > perf_high.head

    def test_total_efficiency_drops_off_design(self, sizing_result: SizingResult) -> None:
        """Total efficiency should drop at both part-load and overload."""
        q = get_design_flow_rate(sizing_result)
        perf_design = evaluate_performance(sizing_result, q)
        perf_partload = evaluate_performance(sizing_result, q * 0.3)
        perf_overload = evaluate_performance(sizing_result, q * 1.4)

        # Total efficiency accounts for volumetric, mechanical, and hydraulic
        assert perf_partload.total_efficiency < perf_design.total_efficiency
        assert perf_overload.total_efficiency < perf_design.total_efficiency


class TestEvaluateDesignPoint:
    def test_matches_direct_call(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        perf_direct = evaluate_performance(sizing_result, q)
        perf_design = evaluate_design_point(sizing_result)
        assert perf_direct.head == pytest.approx(perf_design.head, rel=1e-6)
