"""Tests for axial/mixed-flow sizing."""

from __future__ import annotations

import pytest

from hpe.core.models import OperatingPoint
from hpe.sizing.axial import AxialSizingResult, size_axial


@pytest.fixture
def axial_pump_op() -> OperatingPoint:
    return OperatingPoint(flow_rate=0.5, head=5.0, rpm=1450)


@pytest.fixture
def axial_fan_op() -> OperatingPoint:
    return OperatingPoint(flow_rate=2.0, head=0.1, rpm=1450)


class TestAxialSizing:
    def test_basic(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op)
        assert isinstance(result, AxialSizingResult)
        assert result.d_tip > 0
        assert result.d_hub > 0
        assert result.blade_count > 0

    def test_hub_smaller_than_tip(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op)
        assert result.d_hub < result.d_tip
        assert 0.2 < result.hub_tip_ratio < 0.9

    def test_de_haller_computed(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op)
        assert result.de_haller > 0

    def test_angles_reasonable(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op)
        assert 5 < abs(result.beta1_mean) < 89
        assert 5 < abs(result.beta2_mean) < 89

    def test_reaction_degree(self, axial_pump_op: OperatingPoint) -> None:
        r50 = size_axial(axial_pump_op, reaction=0.5)
        r70 = size_axial(axial_pump_op, reaction=0.7)
        assert r50.reaction_degree == 0.5
        assert r70.reaction_degree == 0.7

    def test_custom_hub_tip(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op, hub_tip_ratio=0.6)
        assert abs(result.hub_tip_ratio - 0.6) < 0.01

    def test_power_positive(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op)
        assert result.estimated_power > 0

    def test_efficiency_reasonable(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op)
        assert 0.3 < result.estimated_efficiency < 1.0

    def test_solidity_range(self, axial_pump_op: OperatingPoint) -> None:
        result = size_axial(axial_pump_op)
        assert 0.3 < result.solidity < 3.0
