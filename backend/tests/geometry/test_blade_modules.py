"""Tests for splitter sizing, NACA thickness, and TD1-style stacking modules."""
import pytest
from hpe.geometry.runner.splitter import size_splitter
from hpe.geometry.blade.naca_thickness import naca_thickness, ellipse_thickness, spanwise_thickness_variation
from hpe.geometry.blade.stacking import StackingConfig, compute_stacking, wrap_angle_from_geometry


class TestSplitter:
    def test_basic_sizing(self):
        r = size_splitter(blade_count=6, d2=0.25, d1=0.12, b2=0.025, beta2=25.0)
        assert r.enabled
        assert r.splitter_blade_count == 6
        assert 0 < r.throat_area_reduction < 1
        assert r.loading_reduction_percent > 0

    def test_warnings_for_extreme_start(self):
        r = size_splitter(blade_count=5, d2=0.2, d1=0.1, b2=0.02, beta2=22.0, start_fraction=0.1)
        assert any('25%' in w for w in r.warnings)

    def test_splitter_start_location(self):
        r = size_splitter(blade_count=6, d2=0.3, d1=0.14, b2=0.03, beta2=28.0, start_fraction=0.5)
        assert r.splitter_start_m > 0


class TestNACAThickness:
    def test_naca0008(self):
        p = naca_thickness(t_max_frac=0.08, n_points=21)
        assert len(p.m_normalized) == 21
        assert len(p.t_normalized) == 21
        assert abs(max(p.t_normalized) - 1.0) < 0.01  # normalized to 1
        assert p.t_normalized[0] == 0.0  # LE: t=0

    def test_closed_te(self):
        p = naca_thickness(t_max_frac=0.12, close_te=True)
        assert p.t_normalized[-1] < 0.01  # TE should be ~closed

    def test_ellipse_profile(self):
        p = ellipse_thickness(t_max_frac=0.1, le_ratio=2.5)
        assert p.t_max_over_chord == 0.1
        assert len(p.m_normalized) > 0

    def test_spanwise_variation(self):
        t = spanwise_thickness_variation(0.12, 0.10, 0.08, 0.5)
        assert 0.08 <= t <= 0.12


class TestStacking:
    def test_no_lean(self):
        cfg = StackingConfig(lean_angle_deg=0.0, wrap_angle_deg=70.0)
        r = compute_stacking(cfg, d2=0.25, d1=0.12, blade_count=6, nq=30.0)
        assert r.pitchwise_offset_hub == 0.0
        assert r.pitchwise_offset_shr == pytest.approx(0.0, abs=1e-6)

    def test_positive_lean_reduces_secondary(self):
        cfg = StackingConfig(lean_angle_deg=10.0)
        r = compute_stacking(cfg, d2=0.25, d1=0.12, blade_count=6, nq=30.0)
        assert r.lean_reduces_secondary_flow

    def test_wrap_angle_estimate(self):
        wrap = wrap_angle_from_geometry(d1=0.12, d2=0.25, beta1=30.0, beta2=22.0, blade_count=6)
        assert 30 < wrap < 150  # should be in plausible range
