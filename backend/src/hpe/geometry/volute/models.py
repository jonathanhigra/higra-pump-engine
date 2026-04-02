"""Data models for volute parametric geometry."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class CrossSectionType(str, Enum):
    CIRCULAR = "circular"
    TRAPEZOIDAL = "trapezoidal"
    RECTANGULAR = "rectangular"


@dataclass
class VoluteParams:
    """Input parameters for volute geometry generation."""

    # From impeller
    d2: float  # Impeller outlet diameter [m]
    b2: float  # Impeller outlet width [m]
    flow_rate: float  # Design flow rate Q [m^3/s]
    cu2: float  # Tangential velocity at impeller outlet [m/s]

    # Volute design
    radial_gap_ratio: float = 0.05  # Gap between D2 and volute inlet (fraction of D2)
    cross_section: CrossSectionType = CrossSectionType.CIRCULAR
    tongue_radius_ratio: float = 0.04  # Tongue radius as fraction of D2
    n_stations: int = 36  # Number of circumferential stations (every 10 deg)

    # Discharge
    discharge_length_ratio: float = 1.5  # Discharge pipe length as fraction of D2
    discharge_diffuser_angle: float = 7.0  # Diffuser half-angle [deg]

    @property
    def r3(self) -> float:
        """Volute inlet radius (base radius of spiral)."""
        return self.d2 / 2.0 * (1.0 + self.radial_gap_ratio)

    @classmethod
    def from_sizing_result(cls, sizing_result: object) -> VoluteParams:
        """Create VoluteParams from a SizingResult."""
        sr = sizing_result
        return cls(
            d2=sr.impeller_d2,  # type: ignore[attr-defined]
            b2=sr.impeller_b2,  # type: ignore[attr-defined]
            flow_rate=sr.velocity_triangles["outlet"]["cm"] * 3.14159 * sr.impeller_d2 * sr.impeller_b2 * 0.88,  # type: ignore[attr-defined]
            cu2=sr.velocity_triangles["outlet"]["cu"],  # type: ignore[attr-defined]
        )


@dataclass
class VoluteSizing:
    """Computed volute sizing — area distribution and cross-section dimensions."""

    theta_stations: list[float]  # Circumferential angles [deg]
    areas: list[float]  # Cross-section area at each station [m^2]
    radii: list[float]  # Outer radius of cross-section at each station [m]
    widths: list[float]  # Width of cross-section at each station [m]
    r3: float  # Base (inlet) radius [m]
    discharge_area: float  # Final discharge area [m^2]
