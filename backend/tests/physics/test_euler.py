"""Tests for off-design Euler head calculations."""

import pytest

from hpe.core.models import SizingResult
from hpe.physics.euler import (
    calc_off_design_euler_head,
    calc_off_design_triangles,
    get_design_flow_rate,
)


class TestOffDesignTriangles:
    def test_returns_two_triangles(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        tri_in, tri_out = calc_off_design_triangles(sizing_result, q)
        assert tri_in.u > 0
        assert tri_out.u > 0
        assert tri_out.cu > 0  # Pump adds swirl

    def test_u_unchanged_at_off_design(self, sizing_result: SizingResult) -> None:
        """Peripheral velocity should not change (same geometry/RPM)."""
        q_design = get_design_flow_rate(sizing_result)
        _, tri_design = calc_off_design_triangles(sizing_result, q_design)
        _, tri_off = calc_off_design_triangles(sizing_result, q_design * 0.7)
        assert tri_design.u == pytest.approx(tri_off.u, rel=1e-6)

    def test_cm_changes_with_flow(self, sizing_result: SizingResult) -> None:
        """Meridional velocity should scale with flow rate."""
        q_design = get_design_flow_rate(sizing_result)
        _, tri_design = calc_off_design_triangles(sizing_result, q_design)
        _, tri_half = calc_off_design_triangles(sizing_result, q_design * 0.5)
        assert tri_half.cm < tri_design.cm


class TestOffDesignEulerHead:
    def test_positive(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        h = calc_off_design_euler_head(sizing_result, q)
        assert h > 0

    def test_increases_at_lower_flow(self, sizing_result: SizingResult) -> None:
        """For backward-curved blades, Euler head increases when Q decreases."""
        q_design = get_design_flow_rate(sizing_result)
        h_design = calc_off_design_euler_head(sizing_result, q_design)
        h_partload = calc_off_design_euler_head(sizing_result, q_design * 0.5)
        assert h_partload > h_design

    def test_decreases_at_higher_flow(self, sizing_result: SizingResult) -> None:
        """Euler head decreases when Q increases (overload)."""
        q_design = get_design_flow_rate(sizing_result)
        h_design = calc_off_design_euler_head(sizing_result, q_design)
        h_overload = calc_off_design_euler_head(sizing_result, q_design * 1.3)
        assert h_overload < h_design

    def test_design_point_matches_sizing(self, sizing_result: SizingResult) -> None:
        """Euler head at design flow should match sizing result."""
        q_design = get_design_flow_rate(sizing_result)
        h_euler = calc_off_design_euler_head(sizing_result, q_design)
        h_sizing = sizing_result.velocity_triangles["euler_head"]
        assert h_euler == pytest.approx(h_sizing, rel=0.05)


class TestGetDesignFlowRate:
    def test_positive(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        assert q > 0

    def test_reasonable_value(self, sizing_result: SizingResult) -> None:
        """Should be close to the input Q=0.05 m3/s."""
        q = get_design_flow_rate(sizing_result)
        assert 0.03 < q < 0.08
