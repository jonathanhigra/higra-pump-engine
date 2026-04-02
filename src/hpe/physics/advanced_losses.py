"""Advanced hydraulic loss models for centrifugal pumps.

Extends the basic loss module with detailed component-level models
matching the granularity of commercial tools like ADT TURBOdesign:

1. Profile loss — blade surface friction (pressure + suction side)
2. Tip leakage loss — flow through tip clearance gap
3. End-wall loss — boundary layers on hub and shroud surfaces
4. Mixing loss — wake mixing at impeller outlet
5. Volute/diffuser loss — downstream losses

Each model is based on established correlations from:
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed.
    - Japikse, D. & Baines, N. (1997). Diffuser Design Technology.
    - Denton, J.D. (1993). Loss mechanisms in turbomachines.
    - Oh, H.W. et al. (1997). An empirical model for centrifugal
      impeller losses.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from hpe.core.models import G, SizingResult, VelocityTriangle


@dataclass
class AdvancedLossBreakdown:
    """Detailed breakdown of hydraulic losses."""

    # Blade-related losses [m head]
    profile_loss_ps: float  # Pressure side skin friction
    profile_loss_ss: float  # Suction side skin friction
    profile_loss_total: float  # Total profile loss

    # Tip clearance losses [m head]
    tip_leakage: float

    # End-wall losses [m head]
    endwall_hub: float
    endwall_shroud: float
    endwall_total: float

    # Mixing loss [m head]
    mixing: float

    # Other losses (from basic model)
    incidence: float
    disk_friction_power: float  # [W]
    recirculation: float

    # Totals
    total_head_loss: float  # Sum of all head losses [m]
    loss_coefficient: float  # Total loss / Euler head


def calc_profile_loss(
    tri_in: VelocityTriangle,
    tri_out: VelocityTriangle,
    d1: float,
    d2: float,
    b2: float,
    blade_count: int,
    surface_roughness: float = 2.0e-6,
    chord_ratio: float = 1.0,
) -> tuple[float, float, float]:
    """Calculate blade profile (skin friction) loss.

    Separates pressure side (PS) and suction side (SS) contributions.
    Uses the Denton (1993) entropy production model adapted for
    centrifugal impellers.

    PS loss: driven by mean velocity on pressure surface
    SS loss: driven by peak velocity on suction surface (higher due to
             diffusion / adverse pressure gradient)

    Args:
        tri_in: Inlet velocity triangle.
        tri_out: Outlet velocity triangle.
        d1: Inlet diameter [m].
        d2: Outlet diameter [m].
        b2: Outlet width [m].
        blade_count: Number of blades.
        surface_roughness: Blade surface roughness [m].
        chord_ratio: Actual chord / ideal chord (>1 for longer blades).

    Returns:
        (loss_ps, loss_ss, total) in meters of head.
    """
    w1 = tri_in.w
    w2 = tri_out.w
    w_mean = (w1 + w2) / 2.0

    # Blade chord length estimate
    r1 = d1 / 2.0
    r2 = d2 / 2.0
    chord = math.sqrt((r2 - r1) ** 2 + (math.pi * (r1 + r2) / blade_count) ** 2)
    chord *= chord_ratio

    # Hydraulic diameter of passage
    pitch = math.pi * (d1 + d2) / (2.0 * blade_count)
    d_h = 2.0 * b2 * pitch / (b2 + pitch)

    # Reynolds number based on chord
    nu = 1.003e-6  # Kinematic viscosity of water [m²/s]
    re_chord = w_mean * chord / nu

    # Friction coefficient (Schlichting correlation for turbulent flow)
    cf = _skin_friction_coefficient(re_chord, surface_roughness, chord)

    # Pressure side: lower velocity, less loss
    w_ps = w_mean * 0.85  # PS velocity ~ 85% of mean
    loss_ps = cf * (chord / d_h) * w_ps**2 / (2.0 * G)

    # Suction side: higher velocity due to loading, more loss
    # Peak velocity on SS depends on diffusion ratio
    w_ss_peak = max(w1, w_mean * 1.2)  # SS peak ~ 120% of mean or w1
    loss_ss = cf * (chord / d_h) * w_ss_peak**2 / (2.0 * G) * 1.3  # 1.3 for adverse PG

    total = loss_ps + loss_ss
    return loss_ps, loss_ss, total


def calc_tip_leakage_loss(
    tri_out: VelocityTriangle,
    d2: float,
    b2: float,
    blade_count: int,
    tip_clearance: float = 0.5e-3,
    is_open_impeller: bool = True,
) -> float:
    """Calculate tip leakage loss through the clearance gap.

    For open impellers, leakage occurs across the blade tip.
    For closed impellers, leakage occurs through wear rings.

    Based on Gulich (2014) correlation:
        ΔH_leak = k * (s/b2) * (Δp / (ρg))

    where s is clearance, Δp is pressure difference across blade.

    Args:
        tri_out: Outlet velocity triangle.
        d2: Outlet diameter [m].
        b2: Outlet width [m].
        blade_count: Number of blades.
        tip_clearance: Clearance gap [m].
        is_open_impeller: True for open, False for closed impeller.

    Returns:
        Tip leakage head loss [m].
    """
    if not is_open_impeller:
        # Closed impeller: leakage through wear rings (smaller effect)
        return _wear_ring_leakage(d2, b2, tip_clearance, tri_out)

    # Pressure difference across blade tip
    # Δp ≈ ρ * u2 * Δcu / Z  (simplified from blade loading)
    u2 = tri_out.u
    cu2 = tri_out.cu

    # Leakage velocity through gap
    delta_p_normalized = u2 * cu2 / blade_count  # [m²/s²]

    # Discharge coefficient for the gap
    cd = 0.6  # Typical for sharp-edged gap

    # Leakage flow ratio
    clearance_ratio = tip_clearance / b2

    # Head loss
    k_leak = 0.6  # Empirical coefficient (Gulich)
    loss = k_leak * clearance_ratio * delta_p_normalized / G

    return abs(loss)


def calc_endwall_loss(
    tri_in: VelocityTriangle,
    tri_out: VelocityTriangle,
    d1: float,
    d2: float,
    b1: float,
    b2: float,
    blade_count: int,
    surface_roughness: float = 5.0e-6,
) -> tuple[float, float, float]:
    """Calculate end-wall (hub and shroud) boundary layer losses.

    End-wall losses arise from boundary layers on the hub and shroud
    surfaces between blades. These are driven by the relative velocity
    field and secondary flows.

    Based on Denton (1993) dissipation coefficient method:
        ΔH_ew = Cd * ∫(V³/V_ref³) dA / (passage_area)

    Simplified using mean values per Gulich.

    Args:
        tri_in: Inlet velocity triangle.
        tri_out: Outlet velocity triangle.
        d1: Inlet diameter [m].
        d2: Outlet diameter [m].
        b1: Inlet width [m].
        b2: Outlet width [m].
        blade_count: Number of blades.
        surface_roughness: Wall surface roughness [m].

    Returns:
        (hub_loss, shroud_loss, total) in meters of head.
    """
    w1 = tri_in.w
    w2 = tri_out.w
    w_mean = (w1 + w2) / 2.0

    # Passage length
    r1 = d1 / 2.0
    r2 = d2 / 2.0
    l_passage = math.sqrt((r2 - r1) ** 2 + (math.pi * (r1 + r2) / (2 * blade_count)) ** 2)

    # Hydraulic diameter
    b_mean = (b1 + b2) / 2.0
    pitch = math.pi * (d1 + d2) / (2.0 * blade_count)
    d_h = 2.0 * b_mean * pitch / (b_mean + pitch)

    # Reynolds number
    nu = 1.003e-6
    re = w_mean * d_h / nu

    # Dissipation coefficient (end-wall)
    cd_ew = 0.002 * (1.0 + (5000.0 / re) ** 0.5)  # Denton correlation

    # Hub loss: influenced by rotation (centrifugal effects)
    u_mean = (tri_in.u + tri_out.u) / 2.0
    w_hub = math.sqrt(w_mean**2 + (0.5 * u_mean) ** 2)  # Higher near hub
    hub_loss = cd_ew * (l_passage / b_mean) * w_hub**2 / (2.0 * G)

    # Shroud loss: stationary wall sees higher relative velocity
    w_shroud = math.sqrt(w_mean**2 + (0.8 * u_mean) ** 2)
    shroud_loss = cd_ew * (l_passage / b_mean) * w_shroud**2 / (2.0 * G)

    return hub_loss, shroud_loss, hub_loss + shroud_loss


def calc_mixing_loss(
    tri_out: VelocityTriangle,
    b2: float,
    blade_count: int,
    blade_thickness: float = 0.004,
) -> float:
    """Calculate wake mixing loss at impeller outlet.

    At the impeller exit, blade wakes mix with the main flow,
    causing entropy production. Based on Denton (1993):

        ΔH_mix = (wake_velocity_defect)² / (2g) * wake_fraction

    The wake fraction depends on blade thickness and loading.

    Args:
        tri_out: Outlet velocity triangle.
        b2: Outlet width [m].
        blade_count: Number of blades.
        blade_thickness: Blade trailing edge thickness [m].

    Returns:
        Mixing head loss [m].
    """
    r2_pitch = math.pi / blade_count  # Angular pitch at outlet [rad]

    # Wake fraction (blocked area / total area)
    # Approximate: blade_thickness / pitch at mean radius
    # But we use a velocity defect model instead
    wake_fraction = blade_thickness * blade_count / (math.pi * b2 * 2)
    wake_fraction = min(wake_fraction, 0.3)  # Cap at 30%

    # Velocity defect in wake
    w2 = tri_out.w
    wake_defect = w2 * 0.3 * wake_fraction  # 30% deficit in wake region

    loss = wake_defect**2 / (2.0 * G)
    return loss


def calc_advanced_losses(
    sizing: SizingResult,
    q_actual: float,
    q_design: float,
    tri_in: VelocityTriangle,
    tri_out: VelocityTriangle,
    tip_clearance: float = 0.5e-3,
    surface_roughness: float = 2.0e-6,
    blade_thickness: float = 0.004,
    is_open_impeller: bool = True,
    rho: float = 998.2,
) -> AdvancedLossBreakdown:
    """Calculate all advanced hydraulic losses.

    Combines profile, tip leakage, end-wall, mixing, incidence,
    disk friction, and recirculation losses.

    Args:
        sizing: SizingResult with design geometry.
        q_actual: Actual flow rate [m³/s].
        q_design: Design flow rate [m³/s].
        tri_in: Inlet velocity triangle at actual Q.
        tri_out: Outlet velocity triangle at actual Q.
        tip_clearance: Tip clearance gap [m].
        surface_roughness: Surface roughness [m].
        blade_thickness: Blade TE thickness [m].
        is_open_impeller: Open or closed impeller.
        rho: Fluid density [kg/m³].

    Returns:
        AdvancedLossBreakdown with all loss components.
    """
    mp = sizing.meridional_profile
    b1 = mp.get("b1", sizing.impeller_b2 * 1.2)

    # Profile loss
    loss_ps, loss_ss, profile_total = calc_profile_loss(
        tri_in, tri_out,
        sizing.impeller_d1, sizing.impeller_d2,
        sizing.impeller_b2, sizing.blade_count,
        surface_roughness,
    )

    # Tip leakage
    tip_leak = calc_tip_leakage_loss(
        tri_out, sizing.impeller_d2, sizing.impeller_b2,
        sizing.blade_count, tip_clearance, is_open_impeller,
    )

    # End-wall loss
    ew_hub, ew_shroud, ew_total = calc_endwall_loss(
        tri_in, tri_out,
        sizing.impeller_d1, sizing.impeller_d2,
        b1, sizing.impeller_b2, sizing.blade_count,
        surface_roughness,
    )

    # Mixing loss
    mixing = calc_mixing_loss(
        tri_out, sizing.impeller_b2, sizing.blade_count, blade_thickness,
    )

    # Incidence (reuse from basic model)
    from hpe.physics.losses import (
        calc_disk_friction_power,
        calc_incidence_loss,
        calc_recirculation_loss,
    )

    incidence = calc_incidence_loss(tri_in, sizing.beta1)

    u2 = sizing.velocity_triangles["outlet"]["u"]
    rpm = 60.0 * u2 / (math.pi * sizing.impeller_d2)

    disk_friction = calc_disk_friction_power(sizing.impeller_d2, rpm, rho)
    recirculation = calc_recirculation_loss(
        q_actual, q_design, sizing.impeller_d2, rpm,
    )

    # Total
    total = (
        profile_total + tip_leak + ew_total + mixing
        + incidence + recirculation
    )

    # Loss coefficient (fraction of Euler head)
    from hpe.sizing.velocity_triangles import calc_euler_head
    h_euler = calc_euler_head(tri_in, tri_out)
    loss_coeff = total / h_euler if h_euler > 1e-6 else 0.0

    return AdvancedLossBreakdown(
        profile_loss_ps=loss_ps,
        profile_loss_ss=loss_ss,
        profile_loss_total=profile_total,
        tip_leakage=tip_leak,
        endwall_hub=ew_hub,
        endwall_shroud=ew_shroud,
        endwall_total=ew_total,
        mixing=mixing,
        incidence=incidence,
        disk_friction_power=disk_friction,
        recirculation=recirculation,
        total_head_loss=total,
        loss_coefficient=loss_coeff,
    )


def _skin_friction_coefficient(
    re: float,
    roughness: float,
    length: float,
) -> float:
    """Calculate skin friction coefficient for turbulent boundary layer.

    Uses the Schlichting (1979) correlation with roughness correction:
        Cf = 0.0592 * Re^(-0.2) for smooth surfaces
        Cf = (1 / (-2 * log10(k/3.71/L)))^2 for rough surfaces (if Re > Re_crit)
    """
    if re < 1e3:
        return 0.01  # Laminar fallback

    cf_smooth = 0.0592 * re**(-0.2)

    # Roughness effect
    relative_roughness = roughness / length if length > 0 else 0
    if relative_roughness > 1e-6:
        re_rough_crit = 100.0 / relative_roughness
        if re > re_rough_crit:
            # Fully rough regime
            log_term = math.log10(relative_roughness / 3.71)
            if abs(log_term) > 1e-10:
                cf_rough = (1.0 / (-2.0 * log_term)) ** 2 / 4.0
                return max(cf_smooth, cf_rough)

    return cf_smooth


def _wear_ring_leakage(
    d2: float,
    b2: float,
    clearance: float,
    tri_out: VelocityTriangle,
) -> float:
    """Estimate head loss from wear ring leakage (closed impeller).

    Leakage through wear rings recirculates from outlet to inlet,
    reducing effective head.
    """
    # Wear ring leakage is smaller than open tip leakage
    # Leakage ratio scales with clearance/b2 but attenuated by
    # the long, narrow gap (labyrinth effect)
    leakage_ratio = clearance / b2  # Fraction of flow lost
    leakage_ratio = min(leakage_ratio, 0.05)

    # Head loss from recirculating leakage flow
    k_wr = 0.1  # Wear ring loss coefficient (much lower than open tip)
    loss = k_wr * leakage_ratio * tri_out.cu * tri_out.u / (2.0 * G)
    return abs(loss)
