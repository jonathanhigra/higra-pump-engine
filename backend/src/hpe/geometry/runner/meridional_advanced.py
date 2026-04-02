"""Advanced meridional channel parameterization.

Extends the basic elliptical-arc meridional channel with:

1. Bezier curve control — hub and shroud defined by control points,
   allowing full designer control over the channel shape.
2. Section dependencies — outlet width depends on inlet, shroud
   inclination angle at outlet, flaring control.
3. Domain extension — inlet and outlet domains for CFD.
4. Parametric constraints — minimum passage width, area ratio,
   curvature limits.

This matches the parametric MRI (Meridional Geometry) capability
of ADT TURBOdesign1's MriGenerator.

References:
    - Zangeneh et al. (1991) for meridional grid generation.
    - Gulich (2014) Ch. 7 for meridional profile guidelines.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from hpe.geometry.models import MeridionalChannel


@dataclass
class BezierControlPoints:
    """Bezier control points for a meridional curve.

    4-point cubic Bezier: P0 (inlet) → P1 → P2 → P3 (outlet).
    Points are in (r, z) space [m].
    """

    p0: tuple[float, float]  # Start (inlet)
    p1: tuple[float, float]  # Control point 1 (near inlet)
    p2: tuple[float, float]  # Control point 2 (near outlet)
    p3: tuple[float, float]  # End (outlet)


@dataclass
class MeridionalParams:
    """Advanced meridional channel parameters.

    Provides full control over the channel shape via Bezier curves
    or parametric constraints, plus domain extension for CFD.
    """

    # Core geometry [m]
    d2: float  # Outlet diameter
    d1: float  # Inlet (eye) diameter
    d1_hub: float  # Hub diameter at inlet
    b2: float  # Outlet width
    b1: float  # Inlet width

    # Shroud inclination at outlet [deg]
    # 0 = perfectly radial, 90 = perfectly axial
    shroud_outlet_angle: float = 0.0

    # Hub inclination at outlet [deg]
    hub_outlet_angle: float = 0.0

    # Bezier control (optional — if None, auto-generated)
    hub_bezier: BezierControlPoints | None = None
    shroud_bezier: BezierControlPoints | None = None

    # Flaring: rate of channel width change near outlet
    # >1 = diverging (diffusing), <1 = converging (accelerating), 1 = constant
    outlet_flaring: float = 1.0

    # Domain extension for CFD [m]
    inlet_extension: float = 0.0  # Upstream straight pipe length
    outlet_extension: float = 0.0  # Downstream extension after impeller

    # Constraints
    min_passage_width_ratio: float = 0.3  # Min width / max width
    max_curvature: float | None = None  # Max curvature [1/m]

    # Discretization
    n_points: int = 50


@dataclass
class MeridionalAnalysis:
    """Analysis results of a meridional channel."""

    area_distribution: list[float]  # Cross-section area [m²] at each station
    width_distribution: list[float]  # Channel width [m] at each station
    curvature_hub: list[float]  # Hub curvature [1/m]
    curvature_shroud: list[float]  # Shroud curvature [1/m]
    area_ratio: float  # A_outlet / A_inlet
    deceleration_ratio: float  # cm_inlet / cm_outlet (>1 = decelerating)
    min_width: float
    max_width: float
    warnings: list[str] = field(default_factory=list)


def generate_advanced_meridional(
    params: MeridionalParams,
) -> MeridionalChannel:
    """Generate an advanced meridional channel with Bezier control.

    If Bezier control points are not provided, auto-generates them
    from the parametric constraints (diameters, widths, angles).

    Args:
        params: Advanced meridional parameters.

    Returns:
        MeridionalChannel with hub and shroud curves.
    """
    n = params.n_points

    # Auto-generate Bezier control points if not provided
    hub_cp = params.hub_bezier or _auto_hub_bezier(params)
    shroud_cp = params.shroud_bezier or _auto_shroud_bezier(params)

    # Evaluate Bezier curves
    hub_points = _eval_cubic_bezier(hub_cp, n)
    shroud_points = _eval_cubic_bezier(shroud_cp, n)

    # Apply flaring correction at outlet
    if abs(params.outlet_flaring - 1.0) > 1e-6:
        hub_points, shroud_points = _apply_flaring(
            hub_points, shroud_points, params.outlet_flaring,
        )

    # Add domain extensions
    if params.inlet_extension > 0:
        hub_points, shroud_points = _add_inlet_extension(
            hub_points, shroud_points, params.inlet_extension,
        )
    if params.outlet_extension > 0:
        hub_points, shroud_points = _add_outlet_extension(
            hub_points, shroud_points, params.outlet_extension,
        )

    return MeridionalChannel(
        hub_points=hub_points,
        shroud_points=shroud_points,
    )


def analyze_meridional(
    channel: MeridionalChannel,
    flow_rate: float = 0.05,
) -> MeridionalAnalysis:
    """Analyze a meridional channel for quality metrics.

    Computes area distribution, curvature, width variation,
    and generates warnings for potential issues.

    Args:
        channel: MeridionalChannel to analyze.
        flow_rate: Design flow rate [m³/s] (for velocity estimation).

    Returns:
        MeridionalAnalysis with distributions and warnings.
    """
    n = len(channel.hub_points)
    warnings: list[str] = []

    widths: list[float] = []
    areas: list[float] = []

    for i in range(n):
        rh, zh = channel.hub_points[i]
        rs, zs = channel.shroud_points[i]
        w = math.sqrt((rs - rh) ** 2 + (zs - zh) ** 2)
        widths.append(w)

        # Approximate cross-section area = 2π * r_mean * width
        r_mean = (rh + rs) / 2.0
        areas.append(2.0 * math.pi * r_mean * w)

    # Curvature
    curv_hub = _compute_curvature(channel.hub_points)
    curv_shroud = _compute_curvature(channel.shroud_points)

    # Area ratio
    area_ratio = areas[-1] / areas[0] if areas[0] > 1e-10 else 1.0

    # Deceleration ratio (cm_in / cm_out)
    blockage = 0.88
    cm_in = flow_rate / (areas[0] * blockage) if areas[0] > 1e-10 else 0
    cm_out = flow_rate / (areas[-1] * blockage) if areas[-1] > 1e-10 else 0
    decel = cm_in / cm_out if cm_out > 1e-10 else 1.0

    min_w = min(widths)
    max_w = max(widths)

    # Warnings
    if min_w / max_w < 0.25:
        warnings.append(
            f"Channel width varies significantly: min/max = {min_w/max_w:.2f}. "
            "Risk of flow acceleration and separation."
        )
    if decel > 1.5:
        warnings.append(
            f"High meridional deceleration ratio {decel:.2f}. "
            "Risk of flow separation in the channel."
        )
    if max(curv_hub) > 20.0 or max(curv_shroud) > 20.0:
        warnings.append(
            "High curvature detected. May cause secondary flow issues."
        )

    return MeridionalAnalysis(
        area_distribution=areas,
        width_distribution=widths,
        curvature_hub=curv_hub,
        curvature_shroud=curv_shroud,
        area_ratio=area_ratio,
        deceleration_ratio=decel,
        min_width=min_w,
        max_width=max_w,
        warnings=warnings,
    )


def _auto_hub_bezier(params: MeridionalParams) -> BezierControlPoints:
    """Auto-generate hub Bezier control points from parametric constraints."""
    r1_hub = params.d1_hub / 2.0
    r2 = params.d2 / 2.0
    z_total = 0.8 * (r2 - params.d1 / 2.0)

    z_outlet = -params.b2 / 2.0

    # Hub outlet angle effect
    hub_angle_rad = math.radians(params.hub_outlet_angle)
    dr_hub = z_total * 0.3 * math.sin(hub_angle_rad)

    p0 = (r1_hub, z_total)  # Inlet
    p1 = (r1_hub + (r2 - r1_hub) * 0.2, z_total * 0.6)  # Near inlet
    p2 = (r2 * 0.85 + dr_hub, z_outlet + z_total * 0.15)  # Near outlet
    p3 = (r2, z_outlet)  # Outlet

    return BezierControlPoints(p0=p0, p1=p1, p2=p2, p3=p3)


def _auto_shroud_bezier(params: MeridionalParams) -> BezierControlPoints:
    """Auto-generate shroud Bezier control points."""
    r1 = params.d1 / 2.0
    r2 = params.d2 / 2.0
    z_total = 0.8 * (r2 - r1)

    z_outlet = params.b2 / 2.0

    # Shroud outlet angle effect
    shroud_angle_rad = math.radians(params.shroud_outlet_angle)
    dr_shroud = z_total * 0.3 * math.sin(shroud_angle_rad)

    p0 = (r1, z_total)  # Inlet
    p1 = (r1 + (r2 - r1) * 0.15, z_total * 0.5)  # Near inlet — tighter turn
    p2 = (r2 * 0.8 + dr_shroud, z_outlet + z_total * 0.1)  # Near outlet
    p3 = (r2, z_outlet)  # Outlet

    return BezierControlPoints(p0=p0, p1=p1, p2=p2, p3=p3)


def _eval_cubic_bezier(
    cp: BezierControlPoints,
    n_points: int,
) -> list[tuple[float, float]]:
    """Evaluate a cubic Bezier curve at n_points uniformly in parameter t.

    B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    """
    points: list[tuple[float, float]] = []
    for i in range(n_points):
        t = i / (n_points - 1)
        t2 = t * t
        t3 = t2 * t
        mt = 1.0 - t
        mt2 = mt * mt
        mt3 = mt2 * mt

        r = mt3 * cp.p0[0] + 3 * mt2 * t * cp.p1[0] + 3 * mt * t2 * cp.p2[0] + t3 * cp.p3[0]
        z = mt3 * cp.p0[1] + 3 * mt2 * t * cp.p1[1] + 3 * mt * t2 * cp.p2[1] + t3 * cp.p3[1]
        points.append((r, z))

    return points


def _apply_flaring(
    hub: list[tuple[float, float]],
    shroud: list[tuple[float, float]],
    flaring: float,
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """Apply outlet flaring by adjusting the last ~30% of the channel."""
    n = len(hub)
    start = int(n * 0.7)

    new_hub = list(hub)
    new_shroud = list(shroud)

    for i in range(start, n):
        t = (i - start) / (n - 1 - start)
        factor = 1.0 + (flaring - 1.0) * t

        rh, zh = hub[i]
        rs, zs = shroud[i]

        # Center of passage
        rc = (rh + rs) / 2.0
        zc = (zh + zs) / 2.0

        # Expand/contract from center
        new_hub[i] = (rc + (rh - rc) * factor, zc + (zh - zc) * factor)
        new_shroud[i] = (rc + (rs - rc) * factor, zc + (zs - zc) * factor)

    return new_hub, new_shroud


def _add_inlet_extension(
    hub: list[tuple[float, float]],
    shroud: list[tuple[float, float]],
    length: float,
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """Add straight inlet extension (axial pipe) upstream."""
    rh0, zh0 = hub[0]
    rs0, zs0 = shroud[0]

    # Extend axially upstream
    ext_hub = (rh0, zh0 + length)
    ext_shroud = (rs0, zs0 + length)

    return [ext_hub] + hub, [ext_shroud] + shroud


def _add_outlet_extension(
    hub: list[tuple[float, float]],
    shroud: list[tuple[float, float]],
    length: float,
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """Add radial outlet extension downstream."""
    rh_end, zh_end = hub[-1]
    rs_end, zs_end = shroud[-1]

    ext_hub = (rh_end + length, zh_end)
    ext_shroud = (rs_end + length, zs_end)

    return hub + [ext_hub], shroud + [ext_shroud]


def _compute_curvature(
    points: list[tuple[float, float]],
) -> list[float]:
    """Compute curvature at each point using finite differences.

    κ = |x'y'' - y'x''| / (x'² + y'²)^(3/2)
    """
    n = len(points)
    curvatures: list[float] = []

    for i in range(n):
        if i == 0 or i == n - 1:
            curvatures.append(0.0)
            continue

        r0, z0 = points[i - 1]
        r1, z1 = points[i]
        r2, z2 = points[i + 1]

        # First derivatives (central)
        dr = (r2 - r0) / 2.0
        dz = (z2 - z0) / 2.0

        # Second derivatives
        d2r = r2 - 2 * r1 + r0
        d2z = z2 - 2 * z1 + z0

        # Curvature
        denom = (dr**2 + dz**2) ** 1.5
        if denom < 1e-15:
            curvatures.append(0.0)
        else:
            kappa = abs(dr * d2z - dz * d2r) / denom
            curvatures.append(kappa)

    return curvatures
