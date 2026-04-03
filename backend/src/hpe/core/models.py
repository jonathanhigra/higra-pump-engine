"""Shared domain models used across HPE modules."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from hpe.core.enums import FluidType, MachineType

# Lazy import to avoid circular dependency at module level
# FluidProperties is imported at runtime in methods that need it.

G = 9.80665  # m/s^2 — standard gravity


# ---------------------------------------------------------------------------
# Velocity triangle
# ---------------------------------------------------------------------------

@dataclass
class VelocityTriangle:
    """Velocity triangle at a given station (inlet or outlet).

    All velocities in m/s, angles in degrees.
    Convention: beta measured from tangential direction,
    alpha measured from tangential direction.
    """
    u: float   # Peripheral (blade) velocity [m/s]
    cm: float  # Meridional component of absolute velocity [m/s]
    cu: float  # Tangential component of absolute velocity [m/s]
    c: float   # Absolute velocity magnitude [m/s]
    w: float   # Relative velocity magnitude [m/s]
    wu: float  # Tangential component of relative velocity [m/s]
    beta: float   # Relative flow angle [deg] (from tangential)
    alpha: float  # Absolute flow angle [deg] (from tangential)

    def as_dict(self) -> dict[str, float]:
        return {
            "u": self.u, "cm": self.cm, "cu": self.cu,
            "c": self.c, "w": self.w, "wu": self.wu,
            "beta": self.beta, "alpha": self.alpha,
        }


# ---------------------------------------------------------------------------
# Strongly-typed sub-results (#27)
# ---------------------------------------------------------------------------

@dataclass
class VelocityTrianglesResult:
    """Typed container for inlet/outlet velocity triangles + Euler head."""
    inlet: VelocityTriangle
    outlet: VelocityTriangle
    euler_head: float  # H_euler [m]

    def as_dict(self) -> dict[str, Any]:
        return {
            "inlet": self.inlet.as_dict(),
            "outlet": self.outlet.as_dict(),
            "euler_head": self.euler_head,
        }


@dataclass
class MeridionalProfileResult:
    """Typed container for the preliminary meridional geometry."""
    d1: float       # Inlet diameter [m]
    d1_hub: float   # Hub diameter at inlet [m]
    d2: float       # Outlet diameter [m]
    b1: float       # Inlet width [m]
    b2: float       # Outlet width [m]
    impeller_type: str  # Classification string

    def as_dict(self) -> dict[str, Any]:
        return {
            "d1": self.d1, "d1_hub": self.d1_hub, "d2": self.d2,
            "b1": self.b1, "b2": self.b2, "impeller_type": self.impeller_type,
        }


@dataclass
class UncertaintyBounds:
    """Symmetric ± uncertainty intervals for key sizing results (#8).

    Intervals reflect the scatter band of the correlations used
    (see hpe.constants for UNCERTAINTY_* factors).
    """
    d2_pct: float       # ± % on D2
    eta_pct: float      # ± % on total efficiency
    npsh_pct: float     # ± % on NPSHr
    b2_pct: float       # ± % on outlet width
    beta2_pct: float    # ± % on blade angles

    def as_dict(self) -> dict[str, float]:
        return {
            "d2_pct": self.d2_pct,
            "eta_pct": self.eta_pct,
            "npsh_pct": self.npsh_pct,
            "b2_pct": self.b2_pct,
            "beta2_pct": self.beta2_pct,
        }


# ---------------------------------------------------------------------------
# Operating point
# ---------------------------------------------------------------------------

@dataclass
class OperatingPoint:
    """Operating point specification for a hydraulic machine.

    This is the primary input for the sizing module and defines
    what the machine needs to achieve.
    """
    flow_rate: float   # Q [m³/s]
    head: float        # H [m]
    rpm: float         # Rotational speed [rev/min]
    machine_type: MachineType = MachineType.CENTRIFUGAL_PUMP
    fluid: FluidType = FluidType.WATER
    fluid_density: float = 998.2    # rho [kg/m³]
    fluid_viscosity: float = 1.003e-3  # mu [Pa·s]
    pre_swirl_angle: float = 0.0    # Inlet pre-swirl angle [deg] (#7)
    slip_model: str = "wiesner"     # Slip factor model: "wiesner"|"stodola"|"busemann" (#1)
    # User geometry overrides (A5)
    override_d2: float | None = None  # m - user override for outlet diameter
    override_b2: float | None = None  # m - user override for outlet width
    override_d1: float | None = None  # m - user override for inlet diameter
    # Optional typed fluid properties (overrides fluid_density when set)
    fluid_props: Any | None = None  # hpe.physics.fluid_properties.FluidProperties

    def cache_key(self) -> tuple:
        """Hashable key for LRU cache (#21)."""
        return (
            round(self.flow_rate, 8),
            round(self.head, 4),
            round(self.rpm, 2),
            self.machine_type.value,
            round(self.pre_swirl_angle, 2),
            self.slip_model,
            round(self.override_d2, 6) if self.override_d2 is not None else None,
            round(self.override_b2, 6) if self.override_b2 is not None else None,
            round(self.override_d1, 6) if self.override_d1 is not None else None,
        )


# ---------------------------------------------------------------------------
# Sizing result
# ---------------------------------------------------------------------------

@dataclass
class SizingResult:
    """Output of the 1D meanline sizing module."""

    specific_speed_ns: float   # Ns [rpm, m³/s, m]
    specific_speed_nq: float   # Nq (metric)
    impeller_d2: float         # Outlet diameter [m]
    impeller_d1: float         # Inlet diameter [m]
    impeller_b2: float         # Outlet width [m]
    blade_count: int
    beta1: float               # Inlet blade angle [deg]
    beta2: float               # Outlet blade angle [deg]
    estimated_efficiency: float   # Total estimated efficiency
    estimated_power: float        # Shaft power [W]
    estimated_npsh_r: float       # Required NPSH [m]
    sigma: float                  # Cavitation index (Thoma)
    # Typed sub-results (#27)
    velocity_triangles_typed: VelocityTrianglesResult | None = None
    meridional_profile_typed: MeridionalProfileResult | None = None
    uncertainty: UncertaintyBounds | None = None   # (#8)
    # B4: de Haller / Lieblein diffusion ratio
    diffusion_ratio: float = 0.0
    # B5: throat area at impeller outlet [m²]
    throat_area: float = 0.0
    # B6: spanwise blade angles at hub/mid/shroud LE
    spanwise_blade_angles: dict[str, Any] = field(default_factory=dict)
    # A7: Basic volute sizing dict (cutwater, throat area, sizing parameter)
    volute_sizing: dict[str, Any] = field(default_factory=dict)
    # Legacy dict fields for API compatibility
    velocity_triangles: dict[str, Any] = field(default_factory=dict)
    meridional_profile: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    convergence_iterations: int = 0  # Number of η convergence iterations (A1)
    # C4: Denton end-wall loss coefficient (dimensionless)
    endwall_loss: float = 0.0
    # C5: Leakage head loss from wearing ring gaps [m]
    leakage_loss_m: float = 0.0
    # C6: ABladek3 geometric stress factor [1/m²]
    abladek3: float = 0.0
    # B7: profile losses — PS and SS separated (dimensionless coefficients)
    profile_loss_ps: float = 0.0
    profile_loss_ss: float = 0.0
    profile_loss_total: float = 0.0
    # C1: minimum static pressure in impeller [Pa absolute]
    pmin_pa: float = 0.0
    # C3: slip factor (Wiesner default)
    slip_factor: float = 0.0


# ---------------------------------------------------------------------------
# Performance metrics
# ---------------------------------------------------------------------------

@dataclass
class PerformanceMetrics:
    """Performance metrics extracted from CFD or physical models."""

    hydraulic_efficiency: float    # eta_h
    volumetric_efficiency: float   # eta_v
    mechanical_efficiency: float   # eta_m
    total_efficiency: float        # eta_total
    head: float                    # H [m]
    torque: float                  # T [N·m]
    power: float                   # P [W]
    npsh_required: float           # NPSH_r [m]
    min_pressure_coefficient: float  # Cp_min
    is_unstable: bool = False      # True if dH/dQ > 0 at this point (#4)
    radial_force: float | None = None          # F_r [N]
    pressure_pulsation: float | None = None    # delta_p/p [%]
