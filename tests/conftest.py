"""Shared test fixtures for HPE test suite."""

import pytest

from hpe.core.enums import FluidType, MachineType
from hpe.core.models import OperatingPoint


@pytest.fixture
def centrifugal_pump_op() -> OperatingPoint:
    """Standard centrifugal pump operating point for testing."""
    return OperatingPoint(
        flow_rate=0.05,  # 50 L/s = 180 m3/h
        head=30.0,  # 30 m
        rpm=1750.0,
        machine_type=MachineType.CENTRIFUGAL_PUMP,
        fluid=FluidType.WATER,
    )


@pytest.fixture
def francis_turbine_op() -> OperatingPoint:
    """Francis turbine operating point for testing."""
    return OperatingPoint(
        flow_rate=2.0,  # 2 m3/s
        head=100.0,  # 100 m
        rpm=600.0,
        machine_type=MachineType.FRANCIS_TURBINE,
        fluid=FluidType.WATER,
    )
