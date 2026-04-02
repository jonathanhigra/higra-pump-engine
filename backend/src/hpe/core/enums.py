"""Enumerations used across HPE modules."""

from enum import Enum


class MachineType(str, Enum):
    """Type of hydraulic turbomachine."""

    CENTRIFUGAL_PUMP = "centrifugal_pump"
    AXIAL_PUMP = "axial_pump"
    MIXED_FLOW_PUMP = "mixed_flow_pump"
    FRANCIS_TURBINE = "francis_turbine"
    PUMP_TURBINE = "pump_turbine"


class FluidType(str, Enum):
    """Working fluid type."""

    WATER = "water"
    SLURRY = "slurry"
    OIL = "oil"
    CUSTOM = "custom"


class SimulationStatus(str, Enum):
    """Status of a simulation run."""

    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OptimizationObjective(str, Enum):
    """Optimization objectives for multi-objective runs."""

    EFFICIENCY = "efficiency"
    CAVITATION = "cavitation"
    ROBUSTNESS = "robustness"
    RADIAL_FORCE = "radial_force"
    PRESSURE_PULSATION = "pressure_pulsation"


class GeometryFormat(str, Enum):
    """CAD export formats."""

    STEP = "step"
    IGES = "iges"
    STL = "stl"
