"""Shared domain models used across HPE modules."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from hpe.core.enums import FluidType, MachineType

G = 9.80665  # m/s^2 — standard gravity


@dataclass
class VelocityTriangle:
    """Velocity triangle at a given station (inlet or outlet).

    All velocities in m/s, angles in degrees.
    Convention: beta measured from tangential direction,
    alpha measured from tangential direction.
    """

    u: float  # Peripheral (blade) velocity [m/s]
    cm: float  # Meridional component of absolute velocity [m/s]
    cu: float  # Tangential component of absolute velocity [m/s]
    c: float  # Absolute velocity magnitude [m/s]
    w: float  # Relative velocity magnitude [m/s]
    wu: float  # Tangential component of relative velocity [m/s]
    beta: float  # Relative flow angle [deg] (from tangential)
    alpha: float  # Absolute flow angle [deg] (from tangential)


@dataclass
class OperatingPoint:
    """Operating point specification for a hydraulic machine.

    This is the primary input for the sizing module and defines
    what the machine needs to achieve.
    """

    flow_rate: float  # Q [m3/s]
    head: float  # H [m]
    rpm: float  # Rotational speed [rev/min]
    machine_type: MachineType = MachineType.CENTRIFUGAL_PUMP
    fluid: FluidType = FluidType.WATER
    fluid_density: float = 998.2  # rho [kg/m3]
    fluid_viscosity: float = 1.003e-3  # mu [Pa.s]


@dataclass
class SizingResult:
    """Output of the 1D meanline sizing module."""

    specific_speed_ns: float  # Ns [rpm, m3/s, m]
    specific_speed_nq: float  # Nq (metric)
    impeller_d2: float  # Outlet diameter [m]
    impeller_d1: float  # Inlet diameter [m]
    impeller_b2: float  # Outlet width [m]
    blade_count: int
    beta1: float  # Inlet blade angle [deg]
    beta2: float  # Outlet blade angle [deg]
    estimated_efficiency: float  # Estimated hydraulic efficiency
    estimated_power: float  # Shaft power [W]
    estimated_npsh_r: float  # Required NPSH [m]
    sigma: float  # Cavitation index
    velocity_triangles: dict[str, Any] = field(default_factory=dict)
    meridional_profile: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass
class PerformanceMetrics:
    """Performance metrics extracted from CFD or physical models."""

    hydraulic_efficiency: float  # eta_h
    volumetric_efficiency: float  # eta_v
    mechanical_efficiency: float  # eta_m
    total_efficiency: float  # eta_total
    head: float  # H [m]
    torque: float  # T [N.m]
    power: float  # P [W]
    npsh_required: float  # NPSH_r [m]
    min_pressure_coefficient: float  # Cp_min
    radial_force: float | None = None  # F_r [N]
    pressure_pulsation: float | None = None  # delta_p/p [%]
