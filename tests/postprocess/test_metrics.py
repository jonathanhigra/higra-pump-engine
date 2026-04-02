"""Tests for CFD metrics calculation."""

import pytest

from hpe.postprocess.metrics import CFDMetrics, calc_performance_from_cfd


class TestCalcPerformance:
    def test_basic_calculation(self) -> None:
        cfd = CFDMetrics(
            torque_z=100.0,  # N.m
            force_radial=50.0,  # N
            pressure_inlet=0.0,  # Pa
            pressure_outlet=294300.0,  # ~30m of water head
            flow_rate=0.05,  # m3/s
        )
        perf = calc_performance_from_cfd(cfd, rpm=1750)

        assert perf.head > 0
        assert perf.power > 0
        assert perf.torque == 100.0
        assert 0 < perf.total_efficiency < 1
        assert perf.radial_force == 50.0

    def test_head_from_pressure(self) -> None:
        rho = 998.2
        g = 9.80665
        target_head = 30.0
        dp = rho * g * target_head

        cfd = CFDMetrics(
            torque_z=100.0,
            force_radial=0.0,
            pressure_inlet=0.0,
            pressure_outlet=dp,
            flow_rate=0.05,
        )
        perf = calc_performance_from_cfd(cfd, rpm=1750)
        assert perf.head == pytest.approx(target_head, rel=0.01)
