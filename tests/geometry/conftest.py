"""Shared fixtures for geometry tests."""

import pytest

from hpe.core.models import OperatingPoint
from hpe.geometry.models import RunnerGeometryParams
from hpe.sizing.meanline import run_sizing


@pytest.fixture
def runner_params() -> RunnerGeometryParams:
    """Standard centrifugal pump runner geometry params."""
    return RunnerGeometryParams(
        d2=0.250,
        d1=0.120,
        d1_hub=0.042,
        b2=0.020,
        b1=0.030,
        beta1=22.0,
        beta2=25.0,
        blade_count=7,
        blade_thickness=0.004,
    )


@pytest.fixture
def sizing_result():
    """SizingResult from a standard centrifugal pump."""
    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    return run_sizing(op)
