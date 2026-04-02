"""Boundary condition generation for OpenFOAM pump simulations.

Calculates physical BC values from operating point data and
generates the 0/ directory files with correct values.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class BCValues:
    """Computed boundary condition values for OpenFOAM."""

    u_inlet: float  # Inlet velocity magnitude [m/s]
    omega_rotor: float  # Rotor angular velocity [rad/s]
    k_init: float  # Turbulent kinetic energy [m2/s2]
    omega_turb_init: float  # Specific dissipation rate [1/s]
    nu: float  # Kinematic viscosity [m2/s]


def calc_bc_values(
    flow_rate: float,
    rpm: float,
    d_inlet: float,
    d_hub: float = 0.0,
    fluid_density: float = 998.2,
    fluid_viscosity: float = 1.003e-3,
    turbulence_intensity: float = 0.05,
    length_scale_ratio: float = 0.1,
) -> BCValues:
    """Calculate boundary condition values from operating parameters.

    Args:
        flow_rate: Q [m3/s].
        rpm: Rotational speed [rev/min].
        d_inlet: Inlet pipe diameter [m].
        d_hub: Hub diameter at inlet [m].
        fluid_density: rho [kg/m3].
        fluid_viscosity: mu [Pa.s].
        turbulence_intensity: I = u'/U (typical 0.03-0.10).
        length_scale_ratio: l/D ratio for turbulence length scale.

    Returns:
        BCValues with all computed values.
    """
    # Kinematic viscosity
    nu = fluid_viscosity / fluid_density

    # Inlet velocity
    a_inlet = math.pi / 4.0 * (d_inlet**2 - d_hub**2)
    u_inlet = flow_rate / a_inlet if a_inlet > 0 else 0.0

    # Rotor angular velocity
    omega_rotor = 2.0 * math.pi * rpm / 60.0

    # Turbulence quantities (k-omega SST)
    # k = 1.5 * (U * I)^2
    k_init = 1.5 * (u_inlet * turbulence_intensity) ** 2
    k_init = max(k_init, 1e-6)

    # omega = k^0.5 / (C_mu^0.25 * l)
    # where l = length_scale_ratio * D_inlet
    c_mu = 0.09
    length_scale = length_scale_ratio * d_inlet
    if length_scale > 0:
        omega_turb = k_init**0.5 / (c_mu**0.25 * length_scale)
    else:
        omega_turb = 100.0

    return BCValues(
        u_inlet=u_inlet,
        omega_rotor=omega_rotor,
        k_init=k_init,
        omega_turb_init=omega_turb,
        nu=nu,
    )


def generate_mrf_properties(
    omega: float,
    axis: tuple[float, float, float] = (0, 0, 1),
    origin: tuple[float, float, float] = (0, 0, 0),
    cell_zone: str = "rotor",
    non_rotating_patches: list[str] | None = None,
) -> str:
    """Generate MRFProperties file content.

    Args:
        omega: Angular velocity [rad/s].
        axis: Rotation axis (default Z-axis).
        origin: Center of rotation.
        cell_zone: Name of the rotating cell zone.
        non_rotating_patches: Patches excluded from rotation.

    Returns:
        MRFProperties file content.
    """
    if non_rotating_patches is None:
        non_rotating_patches = ["inlet", "outlet"]

    patches_str = "\n            ".join(non_rotating_patches)

    return f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      MRFProperties;
}}

MRF1
{{
    cellZone    {cell_zone};
    active      yes;

    nonRotatingPatches ({patches_str});

    origin      ({origin[0]} {origin[1]} {origin[2]});
    axis        ({axis[0]} {axis[1]} {axis[2]});
    omega       {omega:.6f};
}}
"""
