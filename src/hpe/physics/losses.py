"""Hydraulic loss models for centrifugal pumps.

Estimates various loss components that reduce the actual head
from the theoretical Euler head. These correlations enable
fast off-design performance prediction without CFD.

Loss components:
1. Incidence loss — blade inlet angle mismatch at off-design
2. Friction loss — skin friction in impeller passages
3. Diffusion loss — flow deceleration (w1 > w2)
4. Disk friction — viscous friction on hub/shroud disks
5. Recirculation — internal recirculation at part-load
6. Volute/diffuser loss — losses downstream of impeller

References:
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed., Ch. 3.
    - Pfleiderer & Petermann (2005).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from hpe.core.models import G, SizingResult, VelocityTriangle


@dataclass
class LossBreakdown:
    """Breakdown of hydraulic losses at a given operating point."""

    incidence: float  # Head loss from incidence [m]
    friction: float  # Head loss from friction [m]
    diffusion: float  # Head loss from diffusion [m]
    disk_friction: float  # Power loss from disk friction [W]
    recirculation: float  # Head loss from recirculation [m]
    total_head_loss: float  # Sum of head losses [m]


def calc_incidence_loss(
    tri_in: VelocityTriangle,
    beta_blade: float,
) -> float:
    """Calculate incidence loss at impeller inlet.

    At off-design, the flow angle differs from the blade angle,
    causing an incidence loss proportional to the velocity component
    normal to the blade.

    delta_H = k_inc * (w1 * sin(i))^2 / (2g)
    where i = beta_blade - beta_flow (incidence angle)

    Args:
        tri_in: Inlet velocity triangle at actual flow.
        beta_blade: Design inlet blade angle [deg].

    Returns:
        Incidence head loss [m].
    """
    k_inc = 0.7  # Incidence loss coefficient (0.5-0.8 typical)
    incidence_deg = beta_blade - tri_in.beta
    incidence_rad = math.radians(incidence_deg)

    delta_h = k_inc * (tri_in.w * math.sin(incidence_rad)) ** 2 / (2.0 * G)
    return abs(delta_h)


def calc_friction_loss(
    tri_in: VelocityTriangle,
    tri_out: VelocityTriangle,
    d1: float,
    d2: float,
    b2: float,
    blade_count: int,
) -> float:
    """Calculate friction loss in impeller passages.

    Uses a simplified correlation based on mean relative velocity
    and hydraulic diameter of the passage.

    delta_H = 4 * f * L/Dh * w_mean^2 / (2g)

    where:
        f ~ 0.02 (friction factor for turbulent flow)
        L ~ pi * (D2 + D1) / (2 * Z) (passage length)
        Dh ~ 2 * b2 (hydraulic diameter, simplified)

    Args:
        tri_in: Inlet velocity triangle.
        tri_out: Outlet velocity triangle.
        d1: Inlet diameter [m].
        d2: Outlet diameter [m].
        b2: Outlet width [m].
        blade_count: Number of blades.

    Returns:
        Friction head loss [m].
    """
    f = 0.02  # Darcy friction factor (turbulent)
    w_mean = (tri_in.w + tri_out.w) / 2.0

    # Passage length (approximate)
    l_passage = math.pi * (d2 + d1) / (2.0 * blade_count)

    # Hydraulic diameter (simplified)
    d_h = 2.0 * b2

    if d_h < 1e-6:
        return 0.0

    delta_h = 4.0 * f * (l_passage / d_h) * w_mean**2 / (2.0 * G)
    return delta_h


def calc_diffusion_loss(
    tri_in: VelocityTriangle,
    tri_out: VelocityTriangle,
) -> float:
    """Calculate diffusion (deceleration) loss in the impeller.

    When w1 > w2 (relative velocity decelerates), boundary layer
    growth and potential separation cause additional losses.

    delta_H = k_diff * (w1 - w2)^2 / (2g)  for w1 > w2
    delta_H = 0  for w1 <= w2 (accelerating flow, no diffusion loss)

    Args:
        tri_in: Inlet velocity triangle.
        tri_out: Outlet velocity triangle.

    Returns:
        Diffusion head loss [m].
    """
    if tri_in.w <= tri_out.w:
        return 0.0  # No diffusion loss when flow accelerates

    k_diff = 0.3  # Diffusion loss coefficient
    delta_h = k_diff * (tri_in.w - tri_out.w) ** 2 / (2.0 * G)
    return delta_h


def calc_disk_friction_power(
    d2: float,
    rpm: float,
    rho: float = 998.2,
) -> float:
    """Calculate disk friction power loss.

    P_disk = k_df * rho * omega^3 * (D2/2)^5

    where k_df ~ 7.5e-4 for typical clearances.

    Args:
        d2: Outlet diameter [m].
        rpm: Rotational speed [rev/min].
        rho: Fluid density [kg/m^3].

    Returns:
        Disk friction power loss [W].
    """
    k_df = 7.5e-4  # Disk friction coefficient
    omega = 2.0 * math.pi * rpm / 60.0
    r2 = d2 / 2.0

    return k_df * rho * omega**3 * r2**5


def calc_recirculation_loss(
    q_actual: float,
    q_design: float,
    d2: float,
    rpm: float,
) -> float:
    """Calculate recirculation loss at part-load.

    At low flow rates (Q < ~0.5 * Q_design), internal recirculation
    develops at the impeller inlet and outlet, causing significant
    additional losses.

    delta_H = k_rec * u2^2 / (2g) * max(0, 1 - Q/Q_design)^2

    Args:
        q_actual: Actual flow rate [m^3/s].
        q_design: Design flow rate [m^3/s].
        d2: Outlet diameter [m].
        rpm: Rotational speed [rev/min].

    Returns:
        Recirculation head loss [m].
    """
    flow_ratio = q_actual / q_design if q_design > 0 else 0

    if flow_ratio >= 0.8:
        return 0.0  # No significant recirculation above ~80% design flow

    k_rec = 0.005  # Recirculation coefficient
    u2 = math.pi * d2 * rpm / 60.0

    # Recirculation increases strongly below 50% design flow
    recirc_factor = max(0.0, 1.0 - flow_ratio) ** 2

    delta_h = k_rec * u2**2 / (2.0 * G) * recirc_factor
    return delta_h


def calc_total_losses(
    sizing: SizingResult,
    q_actual: float,
    q_design: float,
    tri_in: VelocityTriangle,
    tri_out: VelocityTriangle,
    rho: float = 998.2,
) -> LossBreakdown:
    """Calculate all hydraulic losses at a given operating point.

    Args:
        sizing: SizingResult with design geometry.
        q_actual: Actual flow rate [m^3/s].
        q_design: Design flow rate [m^3/s].
        tri_in: Inlet velocity triangle at actual Q.
        tri_out: Outlet velocity triangle at actual Q.
        rho: Fluid density [kg/m^3].

    Returns:
        LossBreakdown with individual and total losses.
    """
    mp = sizing.meridional_profile

    # Extract RPM from u2
    u2 = sizing.velocity_triangles["outlet"]["u"]
    rpm = 60.0 * u2 / (math.pi * sizing.impeller_d2)

    h_inc = calc_incidence_loss(tri_in, sizing.beta1)
    h_fric = calc_friction_loss(
        tri_in, tri_out,
        sizing.impeller_d1, sizing.impeller_d2,
        sizing.impeller_b2, sizing.blade_count,
    )
    h_diff = calc_diffusion_loss(tri_in, tri_out)
    p_disk = calc_disk_friction_power(sizing.impeller_d2, rpm, rho)
    h_recirc = calc_recirculation_loss(
        q_actual, q_design, sizing.impeller_d2, rpm,
    )

    total = h_inc + h_fric + h_diff + h_recirc

    return LossBreakdown(
        incidence=h_inc,
        friction=h_fric,
        diffusion=h_diff,
        disk_friction=p_disk,
        recirculation=h_recirc,
        total_head_loss=total,
    )
