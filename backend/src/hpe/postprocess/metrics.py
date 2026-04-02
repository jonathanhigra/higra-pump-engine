"""CFD metrics extraction — compute pump performance from simulation results.

Calculates head, efficiency, power, and torque from OpenFOAM
postProcessing data (forces, pressure averages).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from hpe.core.models import G, PerformanceMetrics


@dataclass
class CFDMetrics:
    """Raw metrics extracted from CFD results."""

    torque_z: float  # Torque on impeller around Z axis [N.m]
    force_radial: float  # Radial force on impeller [N]
    pressure_inlet: float  # Average pressure at inlet [Pa]
    pressure_outlet: float  # Average pressure at outlet [Pa]
    flow_rate: float  # Actual flow rate through domain [m3/s]


def calc_performance_from_cfd(
    cfd: CFDMetrics,
    rpm: float,
    rho: float = 998.2,
) -> PerformanceMetrics:
    """Calculate pump performance metrics from CFD results.

    Args:
        cfd: Raw CFD metrics.
        rpm: Rotational speed [rev/min].
        rho: Fluid density [kg/m3].

    Returns:
        PerformanceMetrics.
    """
    omega = 2.0 * math.pi * rpm / 60.0

    # Head from pressure rise
    dp = cfd.pressure_outlet - cfd.pressure_inlet  # [Pa]
    head = dp / (rho * G)  # [m]

    # Shaft power from torque
    power_shaft = abs(cfd.torque_z) * omega  # [W]

    # Hydraulic power
    power_hydraulic = rho * G * cfd.flow_rate * head  # [W]

    # Total efficiency
    eta_total = power_hydraulic / power_shaft if power_shaft > 0 else 0.0
    eta_total = max(0.0, min(1.0, eta_total))

    # Component efficiencies (approximated from total)
    eta_h = min(0.98, eta_total * 1.08)  # Hydraulic ~ total / (eta_v * eta_m)
    eta_v = 0.96  # Approximate
    eta_m = eta_total / (eta_h * eta_v) if (eta_h * eta_v) > 0 else 0.95

    return PerformanceMetrics(
        hydraulic_efficiency=eta_h,
        volumetric_efficiency=eta_v,
        mechanical_efficiency=max(0.5, min(1.0, eta_m)),
        total_efficiency=eta_total,
        head=head,
        torque=abs(cfd.torque_z),
        power=power_shaft,
        npsh_required=0.0,  # Requires cavitation simulation
        min_pressure_coefficient=0.0,  # Requires field extraction
        radial_force=cfd.force_radial,
    )
