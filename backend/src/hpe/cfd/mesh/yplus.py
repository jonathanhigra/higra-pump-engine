"""Wall y+ first-cell height calculator for turbomachinery CFD.

Computes the wall-normal distance for the first mesh cell to achieve
a target y+ value, given flow conditions and blade geometry.

y+ = y * u_tau / nu
u_tau = sqrt(tau_w / rho) ≈ sqrt(C_f/2) * U_ref
C_f correlation (flat-plate turbulent, Prandtl 1/7-power law):
    C_f = 0.027 * Re_L^(-1/7)

References:
    - Schlichting, H. (2000). Boundary Layer Theory, 8th ed., Ch. 21.
    - Gulich, J.F. (2014). Centrifugal Pumps, §8.3.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class YPlusEstimate:
    """Result of first-cell height estimation.

    Attributes
    ----------
    first_cell_height : float
        Wall-normal distance for the first cell [m].
    u_tau : float
        Estimated friction velocity [m/s].
    reynolds : float
        Reynolds number used in the estimate.
    y_plus_check : float
        Back-computed y+ to verify consistency.
    """
    first_cell_height: float
    u_tau: float
    reynolds: float
    y_plus_check: float


def compute_first_cell_height(
    u_ref: float,
    l_ref: float,
    nu: float,
    target_yplus: float = 30.0,
    rho: float = 998.2,
) -> YPlusEstimate:
    """Compute first-cell wall-normal height for a target y+.

    Uses Prandtl's flat-plate correlation for C_f to estimate tau_w
    and then back-computes the cell height from the y+ definition.

        C_f = 0.027 * Re_L^(-1/7)
        tau_w = 0.5 * rho * U_ref^2 * C_f
        u_tau = sqrt(tau_w / rho)
        delta_y = target_yplus * nu / u_tau

    Args:
        u_ref: Reference velocity, typically blade tip speed u2 = pi*D2*n/60 [m/s].
        l_ref: Reference length, typically estimated blade chord [m].
        nu: Kinematic viscosity [m^2/s]. Water at 20°C: 1.004e-6.
        target_yplus: Target y+ value. Use 30–300 for wall functions, 1 for
            low-Re resolved boundary layer.
        rho: Fluid density [kg/m^3].

    Returns:
        YPlusEstimate with first_cell_height and diagnostics.

    Raises:
        ValueError: If u_ref or l_ref are non-positive.
    """
    if u_ref <= 0:
        raise ValueError(f"u_ref must be positive, got {u_ref}")
    if l_ref <= 0:
        raise ValueError(f"l_ref must be positive, got {l_ref}")

    re = u_ref * l_ref / nu
    cf = 0.027 * re ** (-1.0 / 7.0)  # Prandtl 1/7-power law
    tau_w = 0.5 * rho * u_ref ** 2 * cf
    u_tau = math.sqrt(tau_w / rho)
    delta_y = target_yplus * nu / u_tau
    yplus_check = delta_y * u_tau / nu

    return YPlusEstimate(
        first_cell_height=delta_y,
        u_tau=u_tau,
        reynolds=re,
        y_plus_check=yplus_check,
    )


def estimate_blade_chord(
    r1: float,
    r2: float,
    beta1_deg: float,
    beta2_deg: float,
) -> float:
    """Estimate mean streamwise blade chord for Reynolds number calculation.

    Approximates the chord as the arc length of the blade camber line
    integrated from leading to trailing edge using the blade angle profile.

    For a linear beta variation from beta1 to beta2, the chord is:
        chord ≈ (r2 - r1) / sin(beta_mean)  (meridional path / sin)

    Args:
        r1: Inlet (leading edge) radius [m].
        r2: Outlet (trailing edge) radius [m].
        beta1_deg: Inlet blade angle [deg].
        beta2_deg: Outlet blade angle [deg].

    Returns:
        Estimated blade chord length [m].
    """
    dr = r2 - r1
    beta_mean_rad = math.radians((beta1_deg + beta2_deg) / 2.0)
    sin_b = math.sin(beta_mean_rad)
    if sin_b < 1e-6:
        return dr
    return dr / sin_b


def compute_passage_reynolds(
    u_tip: float,
    chord: float,
    nu: float,
) -> float:
    """Compute blade passage Reynolds number Re = U_tip * chord / nu.

    Args:
        u_tip: Blade tip speed u2 [m/s].
        chord: Blade chord estimate [m].
        nu: Kinematic viscosity [m^2/s].

    Returns:
        Reynolds number (dimensionless).
    """
    return u_tip * chord / nu


def o_layer_thickness(
    first_cell_height: float,
    n_cells: int,
    grading: float,
) -> float:
    """Compute total O-layer thickness from cell count and geometric grading.

    For a geometric series of cell sizes:
        d_total = delta_y * (grading^n - 1) / (grading - 1)

    Args:
        first_cell_height: Height of first cell at the wall [m].
        n_cells: Number of cells in the O-layer normal to the wall.
        grading: Geometric growth ratio (last/first cell size).

    Returns:
        Total O-layer thickness [m].
    """
    if abs(grading - 1.0) < 1e-9:
        return first_cell_height * n_cells
    return first_cell_height * (grading ** n_cells - 1.0) / (grading - 1.0)
