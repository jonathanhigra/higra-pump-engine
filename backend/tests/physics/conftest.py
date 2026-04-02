"""Shared fixtures for physics tests."""

import pytest

from hpe.core.models import OperatingPoint, SizingResult
from hpe.sizing.meanline import run_sizing


@pytest.fixture
def sizing_result() -> SizingResult:
    """Standard centrifugal pump sizing for physics tests."""
    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    return run_sizing(op)
