"""Tests for advanced meridional parameterization."""

from __future__ import annotations

import math

import pytest

from hpe.geometry.runner.meridional_advanced import (
    BezierControlPoints,
    MeridionalAnalysis,
    MeridionalParams,
    analyze_meridional,
    generate_advanced_meridional,
)


@pytest.fixture
def default_params() -> MeridionalParams:
    return MeridionalParams(
        d2=0.32, d1=0.16, d1_hub=0.06,
        b2=0.025, b1=0.035,
        n_points=40,
    )


class TestBezierMeridional:
    def test_generates_channel(self, default_params: MeridionalParams) -> None:
        channel = generate_advanced_meridional(default_params)
        assert len(channel.hub_points) == 40
        assert len(channel.shroud_points) == 40

    def test_radius_increases(self, default_params: MeridionalParams) -> None:
        channel = generate_advanced_meridional(default_params)
        r_hub_start = channel.hub_points[0][0]
        r_hub_end = channel.hub_points[-1][0]
        assert r_hub_end > r_hub_start

        r_sh_start = channel.shroud_points[0][0]
        r_sh_end = channel.shroud_points[-1][0]
        assert r_sh_end > r_sh_start

    def test_shroud_outside_hub(self, default_params: MeridionalParams) -> None:
        channel = generate_advanced_meridional(default_params)
        for i in range(len(channel.hub_points)):
            rh = channel.hub_points[i][0]
            rs = channel.shroud_points[i][0]
            # Shroud should be at larger radius or same (at outlet)
            assert rs >= rh - 0.001

    def test_custom_bezier(self) -> None:
        hub_cp = BezierControlPoints(
            p0=(0.03, 0.08), p1=(0.05, 0.05),
            p2=(0.12, 0.01), p3=(0.16, -0.012),
        )
        shroud_cp = BezierControlPoints(
            p0=(0.08, 0.08), p1=(0.10, 0.04),
            p2=(0.14, 0.02), p3=(0.16, 0.012),
        )
        params = MeridionalParams(
            d2=0.32, d1=0.16, d1_hub=0.06,
            b2=0.025, b1=0.035,
            hub_bezier=hub_cp, shroud_bezier=shroud_cp,
            n_points=30,
        )
        channel = generate_advanced_meridional(params)
        assert len(channel.hub_points) == 30
        # First point should match P0
        assert abs(channel.hub_points[0][0] - 0.03) < 1e-6

    def test_shroud_angle_effect(self) -> None:
        params_flat = MeridionalParams(
            d2=0.32, d1=0.16, d1_hub=0.06,
            b2=0.025, b1=0.035,
            shroud_outlet_angle=0.0,
        )
        params_angled = MeridionalParams(
            d2=0.32, d1=0.16, d1_hub=0.06,
            b2=0.025, b1=0.035,
            shroud_outlet_angle=30.0,
        )
        ch_flat = generate_advanced_meridional(params_flat)
        ch_angled = generate_advanced_meridional(params_angled)
        # The channels should differ near the outlet
        r_flat = ch_flat.shroud_points[-5][0]
        r_angled = ch_angled.shroud_points[-5][0]
        assert r_flat != r_angled


class TestFlaring:
    def test_diverging_widens_outlet(self, default_params: MeridionalParams) -> None:
        default_params.outlet_flaring = 1.3
        ch_flared = generate_advanced_meridional(default_params)

        default_params.outlet_flaring = 1.0
        ch_normal = generate_advanced_meridional(default_params)

        # Width at outlet should be larger with flaring > 1
        def _width(ch, idx):
            rh, zh = ch.hub_points[idx]
            rs, zs = ch.shroud_points[idx]
            return math.sqrt((rs - rh) ** 2 + (zs - zh) ** 2)

        w_flared = _width(ch_flared, -1)
        w_normal = _width(ch_normal, -1)
        assert w_flared > w_normal


class TestDomainExtension:
    def test_inlet_extension(self, default_params: MeridionalParams) -> None:
        default_params.inlet_extension = 0.05
        channel = generate_advanced_meridional(default_params)
        # Should have n_points + 1 (extension point)
        assert len(channel.hub_points) == default_params.n_points + 1

    def test_outlet_extension(self, default_params: MeridionalParams) -> None:
        default_params.outlet_extension = 0.03
        channel = generate_advanced_meridional(default_params)
        assert len(channel.hub_points) == default_params.n_points + 1

    def test_both_extensions(self, default_params: MeridionalParams) -> None:
        default_params.inlet_extension = 0.05
        default_params.outlet_extension = 0.03
        channel = generate_advanced_meridional(default_params)
        assert len(channel.hub_points) == default_params.n_points + 2


class TestMeridionalAnalysis:
    def test_basic_analysis(self, default_params: MeridionalParams) -> None:
        channel = generate_advanced_meridional(default_params)
        analysis = analyze_meridional(channel)
        assert isinstance(analysis, MeridionalAnalysis)
        assert len(analysis.area_distribution) == 40
        assert len(analysis.width_distribution) == 40
        assert analysis.area_ratio > 0

    def test_curvature_computed(self, default_params: MeridionalParams) -> None:
        channel = generate_advanced_meridional(default_params)
        analysis = analyze_meridional(channel)
        assert len(analysis.curvature_hub) == 40
        assert len(analysis.curvature_shroud) == 40
        # Endpoints have zero curvature
        assert analysis.curvature_hub[0] == 0.0

    def test_width_positive(self, default_params: MeridionalParams) -> None:
        channel = generate_advanced_meridional(default_params)
        analysis = analyze_meridional(channel)
        assert analysis.min_width > 0
        assert analysis.max_width > analysis.min_width
