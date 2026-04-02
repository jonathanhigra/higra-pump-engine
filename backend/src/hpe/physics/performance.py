"""Single-point performance evaluation.

Given a SizingResult (fixed geometry) and an actual flow rate,
computes all performance metrics: head, efficiencies, power, NPSH.

This is the core function of the physics module — it answers:
"How does this impeller perform at flow rate Q?"
"""

from __future__ import annotations

import math

from hpe.core.models import G, PerformanceMetrics, SizingResult
from hpe.physics.euler import (
    calc_off_design_euler_head,
    calc_off_design_triangles,
    get_design_flow_rate,
)
from hpe.physics.losses import calc_total_losses
from hpe.sizing.cavitation import calc_npsh_required


def evaluate_performance(
    sizing: SizingResult,
    q_actual: float,
    rho: float = 998.2,
) -> PerformanceMetrics:
    """Evaluate pump performance at a given flow rate.

    Pipeline:
        1. Calculate off-design velocity triangles
        2. Calculate Euler head at this Q
        3. Calculate all losses
        4. Actual head = Euler head - losses
        5. Hydraulic efficiency = H_actual / H_euler
        6. Volumetric and mechanical efficiency (adjust for off-design)
        7. Power = rho * g * Q * H / eta_total
        8. NPSH required at this Q

    Args:
        sizing: SizingResult with design geometry.
        q_actual: Actual volumetric flow rate [m^3/s].
        rho: Fluid density [kg/m^3].

    Returns:
        PerformanceMetrics at the given operating point.
    """
    q_design = get_design_flow_rate(sizing)
    flow_ratio = q_actual / q_design if q_design > 0 else 1.0

    # 1. Off-design velocity triangles
    tri_in, tri_out = calc_off_design_triangles(sizing, q_actual)

    # 2. Euler head
    h_euler = calc_off_design_euler_head(sizing, q_actual)

    # 3. Losses
    losses = calc_total_losses(
        sizing, q_actual, q_design, tri_in, tri_out, rho,
    )

    # 4. Actual head
    h_actual = max(0.0, h_euler - losses.total_head_loss)

    # 5. Hydraulic efficiency
    eta_h = h_actual / h_euler if h_euler > 0 else 0.0
    eta_h = max(0.0, min(1.0, eta_h))

    # 6. Volumetric efficiency (degrades slightly off-design)
    eta_v_design = sizing.estimated_efficiency / (
        _estimate_eta_h_design(sizing) * _estimate_eta_m_design(sizing)
    )
    eta_v_design = max(0.8, min(0.99, eta_v_design))
    # Leakage increases at higher pressure (lower Q = higher H)
    eta_v = eta_v_design * (0.95 + 0.05 * min(flow_ratio, 1.0))
    eta_v = max(0.7, min(0.99, eta_v))

    # 7. Mechanical efficiency
    eta_m_design = _estimate_eta_m_design(sizing)
    # Disk friction power is roughly constant; relative impact increases at low Q
    p_useful = rho * G * q_actual * h_actual if q_actual > 0 else 0
    p_disk = losses.disk_friction
    if p_useful + p_disk > 0:
        eta_m = p_useful / (p_useful + p_disk)
    else:
        eta_m = eta_m_design
    eta_m = max(0.5, min(0.99, eta_m))

    # Total efficiency
    eta_total = eta_h * eta_v * eta_m

    # 8. Power
    if eta_total > 0 and q_actual > 0:
        power = rho * G * q_actual * h_actual / eta_total
    else:
        # At shutoff, power is mostly disk friction + recirculation
        u2 = sizing.velocity_triangles["outlet"]["u"]
        power = losses.disk_friction + 0.01 * rho * u2**3 * (sizing.impeller_d2 / 2) ** 2

    # 9. Torque
    rpm = 60.0 * sizing.velocity_triangles["outlet"]["u"] / (
        math.pi * sizing.impeller_d2
    )
    omega = 2.0 * math.pi * rpm / 60.0
    torque = power / omega if omega > 0 else 0.0

    # 10. NPSH
    mp = sizing.meridional_profile
    d1_hub = mp.get("d1_hub", sizing.impeller_d1 * 0.35)
    npsh_r, _ = calc_npsh_required(
        q_actual, h_actual,
        sizing.impeller_d1, d1_hub,
        rpm, sizing.specific_speed_nq,
    )

    # Min pressure coefficient (simplified)
    cp_min = -sizing.sigma * 2.0 * flow_ratio**2

    return PerformanceMetrics(
        hydraulic_efficiency=eta_h,
        volumetric_efficiency=eta_v,
        mechanical_efficiency=eta_m,
        total_efficiency=eta_total,
        head=h_actual,
        torque=torque,
        power=power,
        npsh_required=npsh_r,
        min_pressure_coefficient=cp_min,
    )


def evaluate_design_point(
    sizing: SizingResult,
    rho: float = 998.2,
) -> PerformanceMetrics:
    """Evaluate performance at the design flow rate.

    Convenience function — equivalent to evaluate_performance(sizing, Q_design).

    Args:
        sizing: SizingResult.
        rho: Fluid density [kg/m^3].

    Returns:
        PerformanceMetrics at design point.
    """
    q_design = get_design_flow_rate(sizing)
    return evaluate_performance(sizing, q_design, rho)


def _estimate_eta_h_design(sizing: SizingResult) -> float:
    """Estimate design-point hydraulic efficiency from total efficiency."""
    # eta_total ~ eta_h * eta_v * eta_m
    # Typical: eta_v ~ 0.95, eta_m ~ 0.96
    # So eta_h ~ eta_total / (0.95 * 0.96) ~ eta_total / 0.912
    return min(0.95, sizing.estimated_efficiency / 0.91)


def _estimate_eta_m_design(sizing: SizingResult) -> float:
    """Estimate design-point mechanical efficiency."""
    return 0.96  # Typical for medium centrifugal pumps
