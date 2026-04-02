"""Inverse blade design solver.

Given a prescribed rVθ distribution (blade loading) and meridional
channel geometry, solves for the blade shape (camber line) that
produces the desired loading.

The fundamental equation relating blade shape to loading is:

    dθ/dm = (1 / r) * (d(rVθ)/dm) / (ω * r - rVθ/r) * (r / cm)

where:
    θ = blade wrap angle
    m = meridional coordinate
    r = local radius
    ω = angular velocity
    cm = meridional velocity
    rVθ = angular momentum distribution

This is integrated from leading edge to trailing edge at each
spanwise station to obtain the blade wrap angle θ(m).

References:
    - Zangeneh, M. (1991). A compressible three-dimensional design
      method for radial and mixed flow turbomachinery blades.
    - Borges, J.E. (1990). A three-dimensional inverse method for
      turbomachinery: Part I—Theory.
"""

from __future__ import annotations

import math

from hpe.geometry.inverse.loading import (
    compute_loading_derivative,
    compute_rvt_distribution,
    compute_spanwise_rvt,
)
from hpe.geometry.inverse.models import (
    BladeLoadingSpec,
    InverseDesignResult,
    InverseDesignSpec,
)
from hpe.geometry.models import BladeProfile


def inverse_design(spec: InverseDesignSpec) -> InverseDesignResult:
    """Run the inverse blade design solver.

    Pipeline:
        1. Generate meridional grid (m coordinates at each span)
        2. Compute radius and meridional velocity at each grid point
        3. Compute rVθ distribution at each span
        4. Integrate blade wrap angle θ(m) at each span
        5. Apply thickness to get pressure/suction sides
        6. Compute quality metrics

    Args:
        spec: Complete inverse design specification.

    Returns:
        InverseDesignResult with blade geometry and diagnostics.
    """
    omega = 2.0 * math.pi * spec.rpm / 60.0
    n_m = spec.n_streamwise
    n_s = spec.n_spanwise

    # 1. Spanwise stations (0=hub, 1=shroud)
    span_fractions = [i / (n_s - 1) for i in range(n_s)] if n_s > 1 else [0.5]

    # 2. Meridional coordinates (normalized 0..1)
    m_coords = [i / (n_m - 1) for i in range(n_m)]

    # 3. Compute radius and meridional velocity at each (m, span) point
    r_grid, cm_grid = _compute_flow_field(spec, m_coords, span_fractions, omega)

    # 4. Compute spanwise rVθ_outlet variation
    rvt_outlets = compute_spanwise_rvt(spec.loading, span_fractions)

    # 5. For each span, compute rVθ(m) and integrate for θ(m)
    blade_sections: list[list[tuple[float, float]]] = []
    beta_inlet: list[float] = []
    beta_outlet: list[float] = []
    rvt_distributions: list[list[float]] = []
    wrap_angles: list[float] = []

    for s_idx in range(n_s):
        # Adjust loading for this span's rVθ_outlet
        span_loading = BladeLoadingSpec(
            rvt_inlet=spec.loading.rvt_inlet,
            rvt_outlet=rvt_outlets[s_idx],
            loading_type=spec.loading.loading_type,
            loading_control_points=spec.loading.loading_control_points,
        )

        # Compute rVθ(m) for this span
        rvt_m = compute_rvt_distribution(span_loading, m_coords)
        rvt_distributions.append(rvt_m)

        # Compute loading derivative
        drvt_dm = compute_loading_derivative(rvt_m, m_coords)

        # Extract radius and cm for this span
        r_span = r_grid[s_idx]
        cm_span = cm_grid[s_idx]

        # Integrate blade wrap angle
        theta_m = _integrate_wrap_angle(
            m_coords, r_span, cm_span, rvt_m, drvt_dm, omega,
        )

        # Build (r, theta) blade section
        section = [(r_span[i], theta_m[i]) for i in range(n_m)]
        blade_sections.append(section)

        # Compute blade angles at inlet and outlet
        b_in = _local_blade_angle(
            r_span, theta_m, 0,
        )
        b_out = _local_blade_angle(
            r_span, theta_m, n_m - 1,
        )
        beta_inlet.append(b_in)
        beta_outlet.append(b_out)

        # Wrap angle
        wrap_deg = math.degrees(abs(theta_m[-1] - theta_m[0]))
        wrap_angles.append(wrap_deg)

    # 6. Quality metrics
    max_loading = _calc_max_loading(rvt_distributions, m_coords, spec)
    diff_ratio = _calc_diffusion_ratio(spec, cm_grid, omega)

    return InverseDesignResult(
        blade_sections=blade_sections,
        span_fractions=span_fractions,
        beta_inlet=beta_inlet,
        beta_outlet=beta_outlet,
        rvt_distributions=rvt_distributions,
        meridional_coords=m_coords,
        wrap_angles=wrap_angles,
        max_blade_loading=max_loading,
        diffusion_ratio=diff_ratio,
    )


def inverse_design_to_blade_profile(
    result: InverseDesignResult,
    span_index: int = -1,
    thickness: float = 0.003,
) -> BladeProfile:
    """Convert an inverse design result to a BladeProfile at a given span.

    Uses the midspan by default (span_index=-1 selects middle).

    Args:
        result: InverseDesignResult from inverse_design().
        span_index: Which spanwise station to use. -1 = midspan.
        thickness: Maximum blade thickness [m].

    Returns:
        BladeProfile compatible with the existing geometry pipeline.
    """
    if span_index == -1:
        span_index = len(result.blade_sections) // 2

    camber = result.blade_sections[span_index]

    # Apply thickness using parabolic distribution
    n = len(camber)
    pressure_side: list[tuple[float, float]] = []
    suction_side: list[tuple[float, float]] = []

    for i in range(n):
        r, theta = camber[i]
        s = i / max(n - 1, 1)
        half_t = thickness / 2.0 * 4.0 * s * (1.0 - s)

        if r > 1e-6:
            dtheta = half_t / r
        else:
            dtheta = 0.0

        pressure_side.append((r, theta + dtheta))
        suction_side.append((r, theta - dtheta))

    return BladeProfile(
        camber_points=camber,
        pressure_side=pressure_side,
        suction_side=suction_side,
        thickness=thickness,
    )


def _compute_flow_field(
    spec: InverseDesignSpec,
    m_coords: list[float],
    span_fractions: list[float],
    omega: float,
) -> tuple[list[list[float]], list[list[float]]]:
    """Compute radius and meridional velocity at each grid point.

    For a centrifugal impeller, r increases from r1 to r2 along m.
    The meridional velocity cm = Q / (2π * r * b * blockage).

    Returns:
        (r_grid, cm_grid) — each is [n_spans][n_meridional].
    """
    r1_hub = spec.d1_hub / 2.0
    r1_shroud = spec.d1 / 2.0
    r2 = spec.d2 / 2.0
    b1 = spec.b1
    b2 = spec.b2
    blockage = 0.88

    # Estimate flow rate from target rVθ and geometry
    # Q = cm2 * π * D2 * b2 * blockage
    # cm2 = (u2 - rVθ_out/r2) * tan(β2) — but we don't know β2 yet
    # Use the rVθ to estimate: cu2 = rVθ_out / r2, then use continuity
    u2 = omega * r2
    cu2 = spec.loading.rvt_outlet / r2 if r2 > 0 else 0
    # For estimation, use the relation Q ≈ π * D2 * b2 * cm2 * blockage
    # We need cm2; estimate from typical cm2/u2 ratio (~0.1-0.15)
    cm2_estimate = u2 * 0.12  # Conservative estimate
    q_estimate = math.pi * spec.d2 * b2 * cm2_estimate * blockage

    r_grid: list[list[float]] = []
    cm_grid: list[list[float]] = []

    for s in span_fractions:
        # Radius at inlet varies from hub to shroud
        r1_span = r1_hub + s * (r1_shroud - r1_hub)

        r_row: list[float] = []
        cm_row: list[float] = []

        for m in m_coords:
            # Radius increases from r1 to r2 along m
            r = r1_span + m * (r2 - r1_span)

            # Channel width varies from b1 to b2
            b = b1 + m * (b2 - b1)

            # Meridional velocity from continuity
            area = 2.0 * math.pi * r * b * blockage
            cm = q_estimate / area if area > 1e-10 else 0.0

            r_row.append(r)
            cm_row.append(cm)

        r_grid.append(r_row)
        cm_grid.append(cm_row)

    return r_grid, cm_grid


def _integrate_wrap_angle(
    m_coords: list[float],
    r_span: list[float],
    cm_span: list[float],
    rvt_m: list[float],
    drvt_dm: list[float],
    omega: float,
) -> list[float]:
    """Integrate the blade wrap angle θ(m) from loading.

    The key inverse design equation:

        dθ/dm = (1/r²) * d(rVθ)/dm * (r / cm) / (ω - Vθ/r)

    where Vθ = rVθ / r, so (ω - Vθ/r) = (ω*r² - rVθ) / r².

    Simplified:
        dθ/dm = d(rVθ)/dm / (cm * (ω*r - rVθ/r))

    This captures how the blade must turn to produce the prescribed
    tangential velocity change.
    """
    n = len(m_coords)
    theta = [0.0] * n

    for i in range(1, n):
        dm = m_coords[i] - m_coords[i - 1]
        if dm < 1e-12:
            theta[i] = theta[i - 1]
            continue

        # Average values at i-1 and i (trapezoidal integration)
        r_avg = (r_span[i - 1] + r_span[i]) / 2.0
        cm_avg = (cm_span[i - 1] + cm_span[i]) / 2.0
        rvt_avg = (rvt_m[i - 1] + rvt_m[i]) / 2.0
        drvt_avg = (drvt_dm[i - 1] + drvt_dm[i]) / 2.0

        # Denominator: cm * (ω*r - Vθ) where Vθ = rVθ/r
        vtheta = rvt_avg / r_avg if r_avg > 1e-10 else 0.0
        denom = cm_avg * (omega * r_avg - vtheta)

        if abs(denom) < 1e-10:
            # Singular point — blade angle ≈ 90° (radial blade)
            theta[i] = theta[i - 1]
            continue

        dtheta = drvt_avg / denom * dm
        theta[i] = theta[i - 1] + dtheta

    return theta


def _local_blade_angle(
    r_span: list[float],
    theta_m: list[float],
    index: int,
) -> float:
    """Compute local blade angle β at a given meridional index.

    β = arctan(cm / wu) where wu = u - cu, but for the blade:
    tan(β) = dr / (r * dθ) in the (r, θ) plane.

    For inverse design, the blade angle is:
        β = arctan(dr/dm / (r * dθ/dm))
    """
    n = len(r_span)

    if index == 0 and n > 1:
        dr = r_span[1] - r_span[0]
        r = r_span[0]
        dtheta = theta_m[1] - theta_m[0]
    elif index >= n - 1 and n > 1:
        dr = r_span[-1] - r_span[-2]
        r = r_span[-1]
        dtheta = theta_m[-1] - theta_m[-2]
    elif n > 2:
        dr = r_span[index + 1] - r_span[index - 1]
        r = r_span[index]
        dtheta = theta_m[index + 1] - theta_m[index - 1]
    else:
        return 90.0

    r_dtheta = r * dtheta if r > 1e-10 else 0.0

    if abs(r_dtheta) < 1e-12:
        return 90.0  # Radial blade

    beta_rad = math.atan2(dr, r_dtheta)
    return math.degrees(beta_rad)


def _calc_max_loading(
    rvt_distributions: list[list[float]],
    m_coords: list[float],
    spec: InverseDesignSpec,
) -> float:
    """Calculate maximum normalized blade loading across all spans."""
    delta_rvt = abs(spec.loading.rvt_outlet - spec.loading.rvt_inlet)
    if delta_rvt < 1e-10:
        return 0.0

    max_deriv = 0.0
    for rvt_m in rvt_distributions:
        derivs = compute_loading_derivative(rvt_m, m_coords)
        for d in derivs:
            if abs(d) > max_deriv:
                max_deriv = abs(d)

    # Normalize by total ΔrVθ
    return max_deriv / delta_rvt


def _calc_diffusion_ratio(
    spec: InverseDesignSpec,
    cm_grid: list[list[float]],
    omega: float,
) -> float:
    """Estimate diffusion ratio w1/w2 at midspan."""
    mid = len(cm_grid) // 2
    if not cm_grid or not cm_grid[mid]:
        return 1.0

    r1 = spec.d1 / 2.0
    r2 = spec.d2 / 2.0

    cm1 = cm_grid[mid][0]
    cm2 = cm_grid[mid][-1]

    cu1 = spec.loading.rvt_inlet / r1 if r1 > 1e-10 else 0.0
    cu2 = spec.loading.rvt_outlet / r2 if r2 > 1e-10 else 0.0

    u1 = omega * r1
    u2 = omega * r2

    wu1 = u1 - cu1
    wu2 = u2 - cu2

    w1 = math.sqrt(cm1**2 + wu1**2)
    w2 = math.sqrt(cm2**2 + wu2**2)

    return w1 / w2 if w2 > 1e-10 else 1.0
