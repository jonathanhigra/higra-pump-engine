"""Velocity triangle calculations for turbomachinery.

Improvements:
    #1 — Multiple slip factor models: Wiesner (1967), Stodola, Busemann.
    #2 — Variable blockage factors computed from blade geometry.

References:
    - Gulich (2014), Ch. 3
    - Pfleiderer & Petermann (2005)
    - Wiesner, F.J. (1967). A Review of Slip Factors for Centrifugal Impellers.
    - Stodola, A. (1927). Steam and Gas Turbines.
    - Busemann, A. (1928). Das Förderhöhenverhältnis radialer Kreiselpumpen.
"""

from __future__ import annotations
import math
from hpe.core.models import G, VelocityTriangle
from hpe.constants import (
    BLOCKAGE_INLET, BLOCKAGE_OUTLET,
    SLIP_SIGMA_MIN, SLIP_SIGMA_MAX,
)


def calc_blockage_factor(
    diameter: float,
    width: float,
    blade_count: int,
    blade_thickness: float = 0.003,
    is_inlet: bool = True,
) -> float:
    """Compute blade blockage factor from geometry (#2).

    tau = 1 - Z * t / (pi * D)

    where t is blade thickness at that diameter.

    Args:
        diameter: D [m].
        width: b [m] (unused but kept for signature consistency).
        blade_count: Z.
        blade_thickness: t [m] (default 3 mm).
        is_inlet: If True, use inlet default as fallback; else outlet.

    Returns:
        Blockage factor tau in [0.70, 0.99].
    """
    if diameter <= 0:
        return BLOCKAGE_INLET if is_inlet else BLOCKAGE_OUTLET
    tau = 1.0 - blade_count * blade_thickness / (math.pi * diameter)
    fallback = BLOCKAGE_INLET if is_inlet else BLOCKAGE_OUTLET
    return max(0.70, min(0.99, tau if tau > 0 else fallback))


def calc_peripheral_velocity(diameter: float, rpm: float) -> float:
    """u = pi * D * n / 60."""
    return math.pi * diameter * rpm / 60.0


# ---------------------------------------------------------------------------
# Slip factor models (#1)
# ---------------------------------------------------------------------------

def calc_wiesner_slip_factor(beta2_deg: float, blade_count: int) -> float:
    """Wiesner (1967): sigma = 1 - sqrt(sin(beta2)) / Z^0.7."""
    b2r = math.radians(beta2_deg)
    sigma = 1.0 - math.sqrt(math.sin(b2r)) / (blade_count ** 0.7)
    return max(SLIP_SIGMA_MIN, min(SLIP_SIGMA_MAX, sigma))


def calc_stodola_slip_factor(beta2: float, blade_count: int) -> float:
    """Stodola (1927): sigma = 1 - (pi * sin(beta2)) / Z.

    Simpler than Wiesner; tends to be slightly conservative.
    """
    b2r = math.radians(beta2)
    sigma = 1.0 - (math.pi * math.sin(b2r)) / blade_count
    return max(SLIP_SIGMA_MIN, min(SLIP_SIGMA_MAX, sigma))


def calc_busemann_slip_factor(beta2: float, blade_count: int, d1_d2: float = 0.45) -> float:
    """Busemann (1928) slip factor — accounts for D1/D2 ratio.

    sigma_B = 1 - (pi / Z) * sin(beta2) * (1 + (D1/D2)^2) / 2

    Args:
        beta2: Outlet blade angle [deg].
        blade_count: Z.
        d1_d2: Diameter ratio D1/D2 (default 0.45).

    Returns:
        Slip factor.
    """
    b2r = math.radians(beta2)
    sigma = 1.0 - (math.pi / blade_count) * math.sin(b2r) * (1.0 + d1_d2 ** 2) / 2.0
    return max(SLIP_SIGMA_MIN, min(SLIP_SIGMA_MAX, sigma))


def calc_slip_factor(
    beta2: float,
    blade_count: int,
    model: str = "wiesner",
    d1_d2: float = 0.45,
) -> float:
    """Dispatch to the requested slip factor model.

    Args:
        beta2: Outlet blade angle [deg].
        blade_count: Z.
        model: "wiesner" | "stodola" | "busemann".
        d1_d2: D1/D2 ratio (only used for Busemann).

    Returns:
        Slip factor sigma.
    """
    if model == "stodola":
        return calc_stodola_slip_factor(beta2, blade_count)
    if model == "busemann":
        return calc_busemann_slip_factor(beta2, blade_count, d1_d2)
    return calc_wiesner_slip_factor(beta2_deg=beta2, blade_count=blade_count)  # default


# ---------------------------------------------------------------------------
# Velocity triangles
# ---------------------------------------------------------------------------

def calc_inlet_triangle(
    d1: float,
    b1: float,
    flow_rate: float,
    rpm: float,
    pre_swirl_angle: float = 0.0,
    blockage_factor: float | None = None,
    blade_count: int = 7,
    blade_thickness: float = 0.003,
) -> VelocityTriangle:
    """Calculate velocity triangle at impeller inlet.

    Args:
        d1: Inlet diameter [m].
        b1: Inlet width [m].
        flow_rate: Q [m³/s].
        rpm: Rotational speed [rev/min].
        pre_swirl_angle: Inlet swirl angle [deg] (+ve = co-rotation) (#7).
        blockage_factor: Override tau_1. If None, computed from geometry (#2).
        blade_count: Z (used only when blockage_factor is None).
        blade_thickness: t [m] (used only when blockage_factor is None).

    Returns:
        VelocityTriangle at inlet.
    """
    u1 = calc_peripheral_velocity(d1, rpm)
    tau1 = blockage_factor if blockage_factor is not None else \
        calc_blockage_factor(d1, b1, blade_count, blade_thickness, is_inlet=True)

    inlet_area = math.pi * d1 * b1 * tau1
    cm1 = flow_rate / inlet_area if inlet_area > 0 else 0.0

    # Pre-swirl: cu1 = u1 * tan(alpha_pre) projected appropriately
    if pre_swirl_angle != 0.0:
        alpha_pre_rad = math.radians(pre_swirl_angle)
        cu1 = cm1 / math.tan(math.pi / 2.0 - alpha_pre_rad) if abs(pre_swirl_angle) < 89 else 0.0
    else:
        cu1 = 0.0

    c1 = math.sqrt(cm1 ** 2 + cu1 ** 2)
    wu1 = u1 - cu1
    w1 = math.sqrt(cm1 ** 2 + wu1 ** 2)
    beta1 = math.degrees(math.atan2(cm1, wu1))
    alpha1 = math.degrees(math.atan2(cm1, cu1)) if abs(cu1) > 1e-9 else 90.0

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
    blockage_factor: float | None = None,
    slip_factor: float | None = None,
    blade_count: int = 7,
    blade_thickness: float = 0.003,
    slip_model: str = "wiesner",
    d1_d2: float = 0.45,
) -> VelocityTriangle:
    """Calculate velocity triangle at impeller outlet.

    Args:
        d2: Outlet diameter [m].
        b2: Outlet width [m].
        flow_rate: Q [m³/s].
        rpm: Rotational speed [rev/min].
        beta2: Outlet blade angle [deg].
        blockage_factor: Override tau_2. If None, computed from geometry (#2).
        slip_factor: Override sigma. If None, uses selected model (#1).
        blade_count: Z.
        blade_thickness: t [m].
        slip_model: "wiesner" | "stodola" | "busemann" (#1).
        d1_d2: D1/D2 ratio for Busemann model.

    Returns:
        VelocityTriangle at outlet.
    """
    u2 = calc_peripheral_velocity(d2, rpm)
    tau2 = blockage_factor if blockage_factor is not None else \
        calc_blockage_factor(d2, b2, blade_count, blade_thickness, is_inlet=False)

    outlet_area = math.pi * d2 * b2 * tau2
    cm2 = flow_rate / outlet_area if outlet_area > 0 else 0.0

    beta2_rad = math.radians(beta2)
    tan_b2 = math.tan(beta2_rad)
    cu2_blade = u2 - (cm2 / tan_b2 if abs(tan_b2) > 1e-10 else 0.0)

    if slip_factor is None:
        slip_factor = calc_slip_factor(beta2, blade_count, slip_model, d1_d2)

    cu2 = slip_factor * cu2_blade
    c2 = math.sqrt(cm2 ** 2 + cu2 ** 2)
    wu2 = u2 - cu2
    w2 = math.sqrt(cm2 ** 2 + wu2 ** 2)
    beta2_actual = math.degrees(math.atan2(cm2, wu2))
    alpha2 = math.degrees(math.atan2(cm2, cu2)) if abs(cu2) > 1e-9 else 90.0

    return VelocityTriangle(
        u=u2, cm=cm2, cu=cu2, c=c2,
        w=w2, wu=wu2, beta=beta2_actual, alpha=alpha2,
    )


def calc_euler_head(
    triangle_in: VelocityTriangle,
    triangle_out: VelocityTriangle,
) -> float:
    """H_euler = (u2*cu2 - u1*cu1) / g."""
    return (triangle_out.u * triangle_out.cu - triangle_in.u * triangle_in.cu) / G


def calc_spanwise_blade_angles(
    d1_hub: float, d1_mid: float, d1_shr: float,
    d2: float, b2: float,
    flow_rate: float, rpm: float,
    blade_count: int, blockage_factor: float = 0.9,
) -> dict[str, float]:
    """Calculate blade angles at hub, mid, and shroud spans.

    Inlet angles vary across the span because u1 and cm1 differ with diameter.
    Outlet beta2 is uniform for a radial (centrifugal) impeller and is not
    returned here — it comes from the main sizing result.

    Args:
        d1_hub: Hub inlet diameter [m].
        d1_mid: Mid-span inlet diameter [m].
        d1_shr: Shroud inlet diameter [m].
        d2: Outlet diameter [m] (unused, kept for signature context).
        b2: Outlet width [m] (used as a proxy for inlet passage width).
        flow_rate: Q [m³/s].
        rpm: Rotational speed [rev/min].
        blade_count: Number of blades Z (unused here, kept for future use).
        blockage_factor: Passage blockage tau (default 0.9).

    Returns:
        Dict with keys ``hub_le``, ``mid_le``, ``shr_le`` — inlet blade
        angles [deg] at hub, mid-span, and shroud respectively.
    """
    results: dict[str, float] = {}
    for span_name, d1 in [("hub", d1_hub), ("mid", d1_mid), ("shr", d1_shr)]:
        u1 = math.pi * d1 * rpm / 60.0
        inlet_area = math.pi * d1 * b2 * blockage_factor
        cm1 = flow_rate / inlet_area if inlet_area > 1e-9 else 0.1
        beta1_span = math.degrees(math.atan2(cm1, u1))
        results[f"{span_name}_le"] = round(beta1_span, 2)
    return results
