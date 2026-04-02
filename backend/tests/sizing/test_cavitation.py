"""Tests for cavitation analysis."""

import pytest

from hpe.sizing.cavitation import (
    calc_npsh_required,
    calc_npsh_required_inlet,
    calc_npsh_required_thoma,
    calc_thoma_sigma,
)


class TestThomaSigma:
    def test_positive(self) -> None:
        sigma = calc_thoma_sigma(35)
        assert sigma > 0

    def test_increases_with_nq(self) -> None:
        """Higher Nq pumps require more NPSH."""
        sigma_low = calc_thoma_sigma(20)
        sigma_high = calc_thoma_sigma(80)
        assert sigma_high > sigma_low


class TestNPSHRequiredThoma:
    def test_positive(self) -> None:
        npsh_r = calc_npsh_required_thoma(30.0, 35)
        assert npsh_r > 0

    def test_proportional_to_head(self) -> None:
        npsh_30 = calc_npsh_required_thoma(30.0, 35)
        npsh_60 = calc_npsh_required_thoma(60.0, 35)
        assert npsh_60 == pytest.approx(2 * npsh_30, rel=1e-10)


class TestNPSHRequiredInlet:
    def test_positive(self) -> None:
        npsh_r = calc_npsh_required_inlet(0.05, 0.12, 0.04, 1750)
        assert npsh_r > 0

    def test_typical_range(self) -> None:
        """NPSHr should be 1-15m for typical centrifugal pumps."""
        npsh_r = calc_npsh_required_inlet(0.05, 0.12, 0.04, 1750)
        assert 0.5 < npsh_r < 20


class TestNPSHRequired:
    def test_returns_tuple(self) -> None:
        npsh_r, sigma = calc_npsh_required(0.05, 30.0, 0.12, 0.04, 1750, 35)
        assert npsh_r > 0
        assert sigma > 0

    def test_sigma_relation(self) -> None:
        """sigma = NPSHr / H."""
        npsh_r, sigma = calc_npsh_required(0.05, 30.0, 0.12, 0.04, 1750, 35)
        assert sigma == pytest.approx(npsh_r / 30.0, rel=1e-10)

    def test_typical_centrifugal(self) -> None:
        """NPSHr should be 2-10m for medium centrifugal pump."""
        npsh_r, _ = calc_npsh_required(0.05, 30.0, 0.12, 0.04, 1750, 35)
        assert 1.0 < npsh_r < 15.0
