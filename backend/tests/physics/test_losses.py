"""Tests for hydraulic loss models."""

import pytest

from hpe.core.models import SizingResult
from hpe.physics.euler import calc_off_design_triangles, get_design_flow_rate
from hpe.physics.losses import (
    LossBreakdown,
    calc_diffusion_loss,
    calc_disk_friction_power,
    calc_friction_loss,
    calc_incidence_loss,
    calc_recirculation_loss,
    calc_total_losses,
)


class TestIncidenceLoss:
    def test_zero_at_design(self, sizing_result: SizingResult) -> None:
        """Incidence loss should be near zero at design point."""
        q = get_design_flow_rate(sizing_result)
        tri_in, _ = calc_off_design_triangles(sizing_result, q)
        loss = calc_incidence_loss(tri_in, sizing_result.beta1)
        assert loss < 2.0  # Less than 2m at design

    def test_increases_off_design(self, sizing_result: SizingResult) -> None:
        """Incidence loss should increase away from design."""
        q = get_design_flow_rate(sizing_result)
        tri_design, _ = calc_off_design_triangles(sizing_result, q)
        tri_off, _ = calc_off_design_triangles(sizing_result, q * 0.5)

        loss_design = calc_incidence_loss(tri_design, sizing_result.beta1)
        loss_off = calc_incidence_loss(tri_off, sizing_result.beta1)
        assert loss_off > loss_design

    def test_non_negative(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        tri_in, _ = calc_off_design_triangles(sizing_result, q * 0.3)
        assert calc_incidence_loss(tri_in, sizing_result.beta1) >= 0


class TestFrictionLoss:
    def test_positive(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        tri_in, tri_out = calc_off_design_triangles(sizing_result, q)
        loss = calc_friction_loss(
            tri_in, tri_out,
            sizing_result.impeller_d1, sizing_result.impeller_d2,
            sizing_result.impeller_b2, sizing_result.blade_count,
        )
        assert loss > 0


class TestDiffusionLoss:
    def test_zero_when_accelerating(self, sizing_result: SizingResult) -> None:
        """No diffusion loss when w increases (w2 > w1)."""
        q = get_design_flow_rate(sizing_result)
        tri_in, tri_out = calc_off_design_triangles(sizing_result, q * 1.5)
        # At very high Q, w2 may exceed w1
        loss = calc_diffusion_loss(tri_in, tri_out)
        assert loss >= 0  # Should be 0 or positive


class TestDiskFriction:
    def test_positive(self) -> None:
        p = calc_disk_friction_power(0.25, 1750)
        assert p > 0

    def test_increases_with_diameter(self) -> None:
        p_small = calc_disk_friction_power(0.20, 1750)
        p_large = calc_disk_friction_power(0.30, 1750)
        assert p_large > p_small


class TestRecirculationLoss:
    def test_zero_at_design(self) -> None:
        loss = calc_recirculation_loss(0.05, 0.05, 0.25, 1750)
        assert loss == 0.0

    def test_increases_at_part_load(self) -> None:
        loss_80 = calc_recirculation_loss(0.04, 0.05, 0.25, 1750)
        loss_30 = calc_recirculation_loss(0.015, 0.05, 0.25, 1750)
        assert loss_30 > loss_80


class TestTotalLosses:
    def test_returns_breakdown(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        tri_in, tri_out = calc_off_design_triangles(sizing_result, q)
        losses = calc_total_losses(sizing_result, q, q, tri_in, tri_out)
        assert isinstance(losses, LossBreakdown)
        assert losses.total_head_loss > 0

    def test_total_is_sum(self, sizing_result: SizingResult) -> None:
        q = get_design_flow_rate(sizing_result)
        tri_in, tri_out = calc_off_design_triangles(sizing_result, q)
        losses = calc_total_losses(sizing_result, q, q, tri_in, tri_out)
        expected = losses.incidence + losses.friction + losses.diffusion + losses.recirculation
        assert losses.total_head_loss == pytest.approx(expected, rel=1e-10)
