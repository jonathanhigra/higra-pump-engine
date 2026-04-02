"""Shared fixtures for CFD tests."""

import pytest

from hpe.core.models import OperatingPoint, SizingResult
from hpe.sizing import run_sizing


@pytest.fixture
def sizing_result() -> SizingResult:
    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    return run_sizing(op)
