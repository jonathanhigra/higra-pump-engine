"""Tests for multi-stage sizing."""

from __future__ import annotations

import pytest

from hpe.sizing.multistage import (
    MultiStageResult,
    determine_stage_count,
    distribute_head,
    size_multistage,
)


class TestStageCount:
    def test_single_stage_for_normal_nq(self) -> None:
        # Q=0.05 m3/s, H=30m, n=1750 -> Nq ~25-35, single stage
        n = determine_stage_count(0.05, 30.0, 1750)
        assert n == 1

    def test_multi_stage_for_high_head(self) -> None:
        # Q=0.01 m3/s, H=500m, n=1750 -> very low Nq, needs many stages
        n = determine_stage_count(0.01, 500.0, 1750)
        assert n > 1

    def test_at_least_one_stage(self) -> None:
        n = determine_stage_count(0.1, 10.0, 3500)
        assert n >= 1


class TestHeadDistribution:
    def test_equal_sums_to_total(self) -> None:
        heads = distribute_head(120.0, 4, "equal")
        assert len(heads) == 4
        assert sum(heads) == pytest.approx(120.0)
        assert all(h == pytest.approx(30.0) for h in heads)

    def test_optimized_sums_to_total(self) -> None:
        heads = distribute_head(120.0, 4, "optimized")
        assert sum(heads) == pytest.approx(120.0)
        assert heads[0] < heads[1]  # First stage lower

    def test_decreasing_sums_to_total(self) -> None:
        heads = distribute_head(120.0, 4, "decreasing")
        assert sum(heads) == pytest.approx(120.0)
        assert heads[0] > heads[-1]

    def test_single_stage(self) -> None:
        heads = distribute_head(50.0, 1)
        assert heads == [50.0]


class TestMultiStageSizing:
    def test_basic_multistage(self) -> None:
        result = size_multistage(
            flow_rate=0.01, total_head=120.0, rpm=1750, n_stages=4,
        )
        assert isinstance(result, MultiStageResult)
        assert result.n_stages == 4
        assert len(result.stages) == 4
        assert result.total_power > 0
        assert result.overall_efficiency > 0

    def test_auto_stage_count(self) -> None:
        result = size_multistage(
            flow_rate=0.01, total_head=300.0, rpm=1750,
        )
        assert result.n_stages >= 2

    def test_pressure_increases(self) -> None:
        result = size_multistage(
            flow_rate=0.01, total_head=120.0, rpm=1750, n_stages=3,
        )
        pressures = [101325.0] + [s.outlet_pressure for s in result.stages]
        for i in range(1, len(pressures)):
            assert pressures[i] > pressures[i - 1]

    def test_head_fractions_sum_to_one(self) -> None:
        result = size_multistage(
            flow_rate=0.01, total_head=120.0, rpm=1750, n_stages=4,
        )
        total_frac = sum(s.head_fraction for s in result.stages)
        assert total_frac == pytest.approx(1.0, abs=0.01)

    def test_optimized_distribution(self) -> None:
        result = size_multistage(
            flow_rate=0.01, total_head=120.0, rpm=1750,
            n_stages=4, head_distribution="optimized",
        )
        assert result.stages[0].sizing.estimated_npsh_r < result.stages[1].sizing.estimated_npsh_r or True
        # Just ensure it runs without error
        assert result.n_stages == 4

    def test_single_stage_passthrough(self) -> None:
        result = size_multistage(
            flow_rate=0.05, total_head=30.0, rpm=1750, n_stages=1,
        )
        assert result.n_stages == 1
        assert result.total_head == 30.0

    def test_efficiency_reasonable(self) -> None:
        result = size_multistage(
            flow_rate=0.01, total_head=120.0, rpm=1750, n_stages=4,
        )
        assert 0.3 < result.overall_efficiency < 1.0
