"""Volute sizing — area distribution by conservation of angular momentum.

The volute collects flow from the impeller outlet and converts
kinetic energy (velocity) to pressure energy (static pressure).

Design method:
    Conservation of angular momentum: r * Vu = constant
    At impeller outlet: r2 * cu2 = K (angular momentum constant)
    At volute section theta: Q_theta = Q * theta / (2*pi)
    Mean velocity: V_mean = K / r_centroid
    Area: A(theta) = Q_theta / V_mean

References:
    - Gulich (2014), Ch. 7.
    - Stepanoff (1957), Ch. 10.
"""

from __future__ import annotations

import math

from hpe.geometry.volute.models import CrossSectionType, VoluteParams, VoluteSizing


def size_volute(params: VoluteParams) -> VoluteSizing:
    """Calculate volute area distribution.

    Args:
        params: VoluteParams with impeller data and volute design choices.

    Returns:
        VoluteSizing with area and dimension arrays.
    """
    r3 = params.r3
    Q = params.flow_rate
    cu2 = params.cu2
    r2 = params.d2 / 2.0

    # Angular momentum constant K = r2 * cu2
    K = r2 * cu2

    theta_stations: list[float] = []
    areas: list[float] = []
    radii: list[float] = []
    widths: list[float] = []

    for i in range(params.n_stations + 1):
        theta_deg = i * 360.0 / params.n_stations
        theta_rad = math.radians(theta_deg)

        # Flow collected up to this angle
        Q_theta = Q * theta_rad / (2.0 * math.pi)

        # Cross-section area from angular momentum conservation
        # V_mean = K / r_centroid (approximate r_centroid ~ r3 for sizing)
        V_mean = K / r3 if r3 > 0 else 1.0
        area = Q_theta / V_mean if V_mean > 0 else 0.0

        # Tongue region: area at theta=0 is nominally zero
        # Apply minimum area near tongue
        tongue_min_area = 0.001 * params.b2 * params.d2  # Small but non-zero
        area = max(area, tongue_min_area * min(1.0, theta_deg / 30.0))

        # Cross-section dimensions from area
        if params.cross_section == CrossSectionType.CIRCULAR:
            r_section = math.sqrt(area / math.pi) if area > 0 else 0
            width = 2.0 * r_section
        elif params.cross_section == CrossSectionType.TRAPEZOIDAL:
            # Fixed height = b2, width varies
            width = area / params.b2 if params.b2 > 0 else 0
            r_section = width / 2.0
        else:  # RECTANGULAR
            width = area / params.b2 if params.b2 > 0 else 0
            r_section = width / 2.0

        # Outer radius = r3 + section dimension
        r_outer = r3 + 2.0 * r_section

        theta_stations.append(theta_deg)
        areas.append(area)
        radii.append(r_outer)
        widths.append(width)

    # Discharge area is the final section
    discharge_area = areas[-1] if areas else 0.0

    return VoluteSizing(
        theta_stations=theta_stations,
        areas=areas,
        radii=radii,
        widths=widths,
        r3=r3,
        discharge_area=discharge_area,
    )
