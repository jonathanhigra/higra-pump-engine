"""Tests for efficiency estimation correlations."""

import pytest

from hpe.sizing.efficiency import (
    estimate_all_efficiencies,
    estimate_hydraulic_efficiency,
    estimate_mechanical_efficiency,
    estimate_volumetric_efficiency,
)


class TestHydraulicEfficiency:
    def test_in_valid_range(self) -> None:
        eta_h = estimate_hydraulic_efficiency(0.05, 35)
        assert 0.5 < eta_h < 0.96

    def test_increases_with_flow(self) -> None:
        """Larger pumps tend to have higher efficiency."""
        eta_small = estimate_hydraulic_efficiency(0.005, 35)
        eta_large = estimate_hydraulic_efficiency(0.5, 35)
        assert eta_large > eta_small

    def test_optimal_nq_range(self) -> None:
        """Efficiency should be highest near nq=40."""
        eta_low = estimate_hydraulic_efficiency(0.1, 15)
        eta_opt = estimate_hydraulic_efficiency(0.1, 40)
        eta_high = estimate_hydraulic_efficiency(0.1, 100)
        assert eta_opt >= eta_low
        assert eta_opt >= eta_high


class TestVolumetricEfficiency:
    def test_in_valid_range(self) -> None:
        eta_v = estimate_volumetric_efficiency(35)
        assert 0.80 < eta_v < 0.99

    def test_increases_with_nq(self) -> None:
        """Leakage fraction decreases at higher Nq."""
        eta_low = estimate_volumetric_efficiency(15)
        eta_high = estimate_volumetric_efficiency(80)
        assert eta_high > eta_low


class TestMechanicalEfficiency:
    def test_in_valid_range(self) -> None:
        eta_m = estimate_mechanical_efficiency(0.05, 35)
        assert 0.85 < eta_m < 0.99


class TestAllEfficiencies:
    def test_total_is_product(self) -> None:
        eta_h, eta_v, eta_m, eta_total = estimate_all_efficiencies(0.05, 35)
        assert eta_total == pytest.approx(eta_h * eta_v * eta_m, rel=1e-10)

    def test_all_between_0_and_1(self) -> None:
        eta_h, eta_v, eta_m, eta_total = estimate_all_efficiencies(0.05, 35)
        for eta in [eta_h, eta_v, eta_m, eta_total]:
            assert 0 < eta < 1

    def test_typical_centrifugal(self) -> None:
        """Medium centrifugal pump should have 70-88% total efficiency."""
        _, _, _, eta_total = estimate_all_efficiencies(0.05, 35)
        assert 0.65 < eta_total < 0.90
