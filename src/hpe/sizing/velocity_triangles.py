"""Velocity triangle calculations for turbomachinery.

Computes inlet and outlet velocity triangles and Euler head
for centrifugal pump impellers. The velocity triangle relates
peripheral velocity (u), absolute velocity (c), and relative
velocity (w) at any given station.

Convention:
    - Angles measured from tangential (circumferential) direction
    - beta: relative flow angle (blade angle)
    - alpha: absolute flow angle
    - cu: tangential component of absolute velocity (pre-swirl)
    - cm: meridional component (through-flow)

References:
    - Gulich (2014), Ch. 3
    - Pfleiderer & Petermann (2005)
"""

from __future__ import annotations

import math

from hpe.core.models import G, VelocityTriangle


def calc_peripheral_velocity(diameter: float, rpm: float) -> float:
    """Calculate peripheral (blade tip) velocity.

    u = pi * D * n / 60

    Args:
        diameter: D [m].
        rpm: Rotational speed n [rev/min].

    Returns:
        Peripheral velocity u [m/s].
    """
    return math.pi * diameter * rpm / 60.0


def calc_inlet_triangle(
    d1: float,
    b1: float,
    flow_rate: float,
    rpm: float,
    pre_swirl_cu1: float = 0.0,
    blockage_factor: float = 0.90,
) -> VelocityTriangle:
    """Calculate velocity triangle at impeller inlet.

    Assumes axial entry with no pre-swirl by default (cu1=0),
    which is typical for pumps without inlet guide vanes.

    Args:
        d1: Inlet diameter [m].
        b1: Inlet width [m].
        flow_rate: Q [m^3/s].
        rpm: Rotational speed [rev/min].
        pre_swirl_cu1: Tangential component of inlet absolute velocity [m/s].
        blockage_factor: Blade blockage factor at inlet (default 0.90).

    Returns:
        VelocityTriangle at inlet.
    """
    u1 = calc_peripheral_velocity(d1, rpm)
    # Meridional velocity: Q = pi * D1 * b1 * cm1 * blockage
    inlet_area = math.pi * d1 * b1 * blockage_factor
    cm1 = flow_rate / inlet_area

    cu1 = pre_swirl_cu1
    c1 = math.sqrt(cm1**2 + cu1**2)

    wu1 = u1 - cu1  # Tangential relative velocity
    w1 = math.sqrt(cm1**2 + wu1**2)

    beta1 = math.degrees(math.atan2(cm1, wu1))
    alpha1 = math.degrees(math.atan2(cm1, cu1)) if cu1 != 0 else 90.0

    return VelocityTriangle(
        u=u1, cm=cm1, cu=cu1, c=c1,
        w=w1, wu=wu1, beta=beta1, alpha=alpha1,
    )


def calc_outlet_triangle(
    d2: float,
    b2: float,
    flow_rate: float,
    rpm: float,
    beta2: float,
    blockage_factor: float = 0.88,
    slip_factor: float | None = None,
    blade_count: int = 7,
) -> VelocityTriangle:
    """Calculate velocity triangle at impeller outlet.

    Args:
        d2: Outlet diameter [m].
        b2: Outlet width [m].
        flow_rate: Q [m^3/s].
        rpm: Rotational speed [rev/min].
        beta2: Outlet blade angle [deg] (from tangential).
        blockage_factor: Blade blockage factor at outlet.
        slip_factor: Override slip factor. If None, uses Wiesner correlation.
        blade_count: Number of blades (for slip factor calculation).

    Returns:
        VelocityTriangle at outlet.
    """
    u2 = calc_peripheral_velocity(d2, rpm)
    outlet_area = math.pi * d2 * b2 * blockage_factor
    cm2 = flow_rate / outlet_area

    # Ideal (blade-congruent) tangential velocity
    beta2_rad = math.radians(beta2)
    cu2_blade = u2 - cm2 / math.tan(beta2_rad)

    # Apply slip factor (Wiesner correlation if not provided)
    if slip_factor is None:
        slip_factor = calc_wiesner_slip_factor(beta2, blade_count)

    cu2 = slip_factor * cu2_blade
    c2 = math.sqrt(cm2**2 + cu2**2)

    wu2 = u2 - cu2
    w2 = math.sqrt(cm2**2 + wu2**2)

    # Actual flow angles
    beta2_actual = math.degrees(math.atan2(cm2, wu2))
    alpha2 = math.degrees(math.atan2(cm2, cu2))

    return VelocityTriangle(
        u=u2, cm=cm2, cu=cu2, c=c2,
        w=w2, wu=wu2, beta=beta2_actual, alpha=alpha2,
    )


def calc_wiesner_slip_factor(beta2: float, blade_count: int) -> float:
    """Calculate slip factor using Wiesner (1967) correlation.

    sigma = 1 - sqrt(sin(beta2)) / Z^0.7

    Args:
        beta2: Outlet blade angle [deg].
        blade_count: Number of blades Z.

    Returns:
        Slip factor (0 < sigma < 1).
    """
    beta2_rad = math.radians(beta2)
    sigma = 1.0 - math.sqrt(math.sin(beta2_rad)) / blade_count**0.7
    return max(0.5, min(0.95, sigma))


def calc_euler_head(
    triangle_in: VelocityTriangle,
    triangle_out: VelocityTriangle,
) -> float:
    """Calculate theoretical Euler head from velocity triangles.

    H_euler = (u2 * cu2 - u1 * cu1) / g

    Args:
        triangle_in: Inlet velocity triangle.
        triangle_out: Outlet velocity triangle.

    Returns:
        Euler head H_euler [m].
    """
    return (
        triangle_out.u * triangle_out.cu - triangle_in.u * triangle_in.cu
    ) / G
