"""Data models for inverse blade design."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class LoadingType(str, Enum):
    """Streamwise blade loading distribution type."""

    FORE_LOADED = "fore_loaded"
    AFT_LOADED = "aft_loaded"
    MID_LOADED = "mid_loaded"
    CUSTOM = "custom"


class StackingCondition(str, Enum):
    """Blade stacking condition at trailing edge."""

    FREE_VORTEX = "free_vortex"
    CONSTANT_RVT = "constant_rvt"
    CUSTOM = "custom"


@dataclass
class BladeLoadingSpec:
    """Specification of blade loading for inverse design.

    The loading is defined as the streamwise derivative of rVθ
    (angular momentum) along the blade, from leading edge (m=0)
    to trailing edge (m=1), at multiple spanwise stations.

    rVθ is the product of radius and tangential absolute velocity,
    which directly relates to the Euler work via:
        H = (rVθ_out - rVθ_in) * ω / g
    """

    # Target rVθ values [m²/s]
    rvt_inlet: float  # rVθ at leading edge (0 for no pre-swirl)
    rvt_outlet: float  # rVθ at trailing edge

    # Loading distribution type
    loading_type: LoadingType = LoadingType.MID_LOADED

    # Custom loading control points (m, weight) for LoadingType.CUSTOM
    # m ∈ [0, 1] is normalized meridional coordinate
    # weight determines how much of ΔrVθ is applied at that location
    loading_control_points: list[tuple[float, float]] = field(
        default_factory=list,
    )

    # Spanwise variation
    n_spans: int = 5  # Number of spanwise stations (hub to shroud)
    stacking: StackingCondition = StackingCondition.FREE_VORTEX

    # Spanwise rVθ_outlet distribution (if stacking=CUSTOM)
    # List of (span_fraction, rvt_outlet) pairs
    spanwise_rvt: list[tuple[float, float]] = field(default_factory=list)


@dataclass
class InverseDesignSpec:
    """Complete specification for inverse blade design.

    Combines meridional geometry with blade loading to fully
    define the inverse design problem.
    """

    # Impeller geometry
    d2: float  # Outlet diameter [m]
    d1: float  # Inlet diameter [m]
    d1_hub: float  # Hub diameter at inlet [m]
    b2: float  # Outlet width [m]
    b1: float  # Inlet width [m]
    blade_count: int  # Number of blades
    rpm: float  # Rotational speed [rev/min]

    # Blade loading
    loading: BladeLoadingSpec = field(default_factory=BladeLoadingSpec)

    # Discretization
    n_streamwise: int = 50  # Points along meridional direction
    n_spanwise: int = 5  # Spanwise stations (hub to shroud)

    # Thickness
    blade_thickness: float = 0.003  # Maximum thickness [m]

    @classmethod
    def from_sizing_result(
        cls,
        sizing_result: object,
        rpm: float,
        loading_type: LoadingType = LoadingType.MID_LOADED,
    ) -> InverseDesignSpec:
        """Create InverseDesignSpec from a SizingResult.

        Computes rvt_inlet and rvt_outlet from the velocity triangles
        in the sizing result.
        """
        sr = sizing_result
        mp = sr.meridional_profile  # type: ignore[attr-defined]
        vt = sr.velocity_triangles  # type: ignore[attr-defined]

        r1 = sr.impeller_d1 / 2.0  # type: ignore[attr-defined]
        r2 = sr.impeller_d2 / 2.0  # type: ignore[attr-defined]

        rvt_inlet = r1 * vt["inlet"]["cu"]
        rvt_outlet = r2 * vt["outlet"]["cu"]

        loading = BladeLoadingSpec(
            rvt_inlet=rvt_inlet,
            rvt_outlet=rvt_outlet,
            loading_type=loading_type,
        )

        return cls(
            d2=sr.impeller_d2,  # type: ignore[attr-defined]
            d1=sr.impeller_d1,  # type: ignore[attr-defined]
            d1_hub=mp.get("d1_hub", sr.impeller_d1 * 0.35),  # type: ignore[attr-defined]
            b2=sr.impeller_b2,  # type: ignore[attr-defined]
            b1=mp.get("b1", sr.impeller_b2 * 1.2),  # type: ignore[attr-defined]
            blade_count=sr.blade_count,  # type: ignore[attr-defined]
            rpm=rpm,
            loading=loading,
        )


@dataclass
class InverseDesignResult:
    """Output of the inverse blade design solver.

    Contains the blade geometry derived from the prescribed loading,
    along with the resulting flow field and blade angles.
    """

    # Blade geometry at each spanwise station
    # Each station: list of (r, theta) points from LE to TE
    blade_sections: list[list[tuple[float, float]]]

    # Spanwise positions (0=hub, 1=shroud)
    span_fractions: list[float]

    # Resulting blade angles [deg] at inlet and outlet per span
    beta_inlet: list[float]
    beta_outlet: list[float]

    # rVθ distribution along each span [m²/s]
    rvt_distributions: list[list[float]]

    # Meridional coordinates for each span
    meridional_coords: list[list[float]]  # Normalized m ∈ [0, 1]

    # Wrap angles per span [deg]
    wrap_angles: list[float]

    # Quality metrics
    max_blade_loading: float  # Max |d(rVθ)/dm| normalized
    diffusion_ratio: float  # w_inlet / w_outlet at midspan
