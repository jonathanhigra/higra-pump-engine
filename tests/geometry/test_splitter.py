"""Tests for splitter blade generation."""

from __future__ import annotations

import math

import pytest

from hpe.geometry.models import BladeProfile, RunnerGeometryParams
from hpe.geometry.runner.blade import generate_blade_profile
from hpe.geometry.runner.splitter import (
    SplitterConfig,
    calc_splitter_effect_on_performance,
    generate_splitter_blades,
)


@pytest.fixture
def runner_params() -> RunnerGeometryParams:
    return RunnerGeometryParams(
        d2=0.320, d1=0.160, d1_hub=0.060,
        b2=0.025, b1=0.035,
        beta1=22.0, beta2=25.0,
        blade_count=7, blade_thickness=0.004,
    )


@pytest.fixture
def main_profile(runner_params: RunnerGeometryParams) -> BladeProfile:
    return generate_blade_profile(runner_params, n_points=50)


@pytest.fixture
def splitter_config() -> SplitterConfig:
    return SplitterConfig(
        enabled=True, count=7,
        start_fraction=0.50, work_ratio=0.50,
    )


class TestSplitterGeneration:
    def test_disabled_returns_empty(self, main_profile, runner_params) -> None:
        config = SplitterConfig(enabled=False)
        result = generate_splitter_blades(main_profile, runner_params, config)
        assert result.count == 0
        assert len(result.profiles) == 0

    def test_generates_correct_count(self, main_profile, runner_params, splitter_config) -> None:
        result = generate_splitter_blades(main_profile, runner_params, splitter_config)
        assert result.count == 7
        assert len(result.profiles) == 7

    def test_splitter_shorter_than_main(self, main_profile, runner_params, splitter_config) -> None:
        result = generate_splitter_blades(main_profile, runner_params, splitter_config)
        main_len = len(main_profile.camber_points)
        for profile in result.profiles:
            assert len(profile.camber_points) < main_len

    def test_splitter_starts_after_le(self, main_profile, runner_params, splitter_config) -> None:
        result = generate_splitter_blades(main_profile, runner_params, splitter_config)
        main_r_start = main_profile.camber_points[0][0]
        for profile in result.profiles:
            splitter_r_start = profile.camber_points[0][0]
            assert splitter_r_start > main_r_start

    def test_splitter_ends_at_same_radius(self, main_profile, runner_params, splitter_config) -> None:
        result = generate_splitter_blades(main_profile, runner_params, splitter_config)
        main_r_end = main_profile.camber_points[-1][0]
        for profile in result.profiles:
            assert abs(profile.camber_points[-1][0] - main_r_end) < 1e-6

    def test_angular_positions_spaced(self, main_profile, runner_params, splitter_config) -> None:
        result = generate_splitter_blades(main_profile, runner_params, splitter_config)
        pitch = 2 * math.pi / 7
        for i, pos in enumerate(result.angular_positions):
            expected = i * pitch + pitch / 2.0
            assert abs(pos - expected) < 0.1

    def test_thickness_thinner(self, main_profile, runner_params, splitter_config) -> None:
        result = generate_splitter_blades(main_profile, runner_params, splitter_config)
        for profile in result.profiles:
            assert profile.thickness < main_profile.thickness

    def test_work_ratio_affects_wrap(self, main_profile, runner_params) -> None:
        config_50 = SplitterConfig(enabled=True, count=7, work_ratio=0.50)
        config_80 = SplitterConfig(enabled=True, count=7, work_ratio=0.80)

        result_50 = generate_splitter_blades(main_profile, runner_params, config_50)
        result_80 = generate_splitter_blades(main_profile, runner_params, config_80)

        # Higher work ratio = more wrap
        wrap_50 = abs(result_50.profiles[0].camber_points[-1][1] - result_50.profiles[0].camber_points[0][1])
        wrap_80 = abs(result_80.profiles[0].camber_points[-1][1] - result_80.profiles[0].camber_points[0][1])
        assert wrap_80 > wrap_50


class TestSplitterPerformanceEffect:
    def test_effective_blade_count(self) -> None:
        effect = calc_splitter_effect_on_performance(
            main_blade_count=7, splitter_count=7,
            work_ratio=0.5, start_fraction=0.5,
        )
        # z_eff = 7 + 7 * (1-0.5) * 0.5 = 8.75
        assert abs(effect["z_effective"] - 8.75) < 0.01

    def test_efficiency_improvement(self) -> None:
        effect = calc_splitter_effect_on_performance(
            main_blade_count=7, splitter_count=7,
            work_ratio=0.5, start_fraction=0.5,
        )
        assert effect["efficiency_improvement"] > 0
        assert effect["efficiency_improvement"] < 0.05  # Reasonable bound

    def test_head_correction_positive(self) -> None:
        effect = calc_splitter_effect_on_performance(
            main_blade_count=7, splitter_count=7,
            work_ratio=0.5, start_fraction=0.5,
        )
        assert effect["head_correction"] > 0.95
        assert effect["head_correction"] < 1.10
