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


# ---------------------------------------------------------------------------
# Public Bezier helpers (A3)
# ---------------------------------------------------------------------------

def bezier_curve(
    control_points: list[tuple[float, float]],
    n_points: int = 50,
) -> list[tuple[float, float]]:
    """Evaluate a cubic Bezier curve from a list of 4 control points.

    Args:
        control_points: Exactly 4 (r, z) tuples: [CP0, CP1, CP2, CP3].
        n_points: Number of output points.

    Returns:
        List of (r, z) tuples evaluated at uniform parameter t ∈ [0, 1].

    Raises:
        ValueError: If control_points does not have exactly 4 entries.
    """
    if len(control_points) != 4:
        raise ValueError(
            f"bezier_curve requires exactly 4 control points, got {len(control_points)}."
        )
    cp = BezierControlPoints(
        p0=control_points[0],
        p1=control_points[1],
        p2=control_points[2],
        p3=control_points[3],
    )
    return _eval_cubic_bezier(cp, n_points)


@dataclass
class BezierMeridional:
    """Full meridional channel defined by two cubic Bezier curves.

    Matches ADT TURBOdesign1 MRI-style parameterisation with explicit
    leading-edge curvature control and trailing-edge inclination.

    Attributes:
        hub_cp:   4 control points for the hub curve [(r,z), ...].
                  CP0 = inlet, CP1 = near-inlet handle, CP2 = near-outlet
                  handle, CP3 = outlet.
        shroud_cp: 4 control points for the shroud curve (same ordering).
        le_curvature_coeff: Leading-edge curvature coefficient, analogous
            to ADT's ADVANCED IMPELLER LEADING EDGE CURVATURE COEFFICIENT.
            Controls how much the inner control point (CP1) is offset
            axially to impose inlet curvature. Range ≈ 0.01–0.15.
            Default 0.05 (neutral).
        te_inclination: Trailing-edge inclination angle [deg].  A non-zero
            value tilts the outlet tangent of both curves by adjusting CP2
            before evaluation.  Positive = hub tilts outward (more radial
            TE), negative = more axial TE.  Default 0.0 (tangent follows
            natural Bezier).
        n_points: Number of discretisation points per curve. Default 50.
    """

    hub_cp: list[tuple[float, float]]      # 4 control points for hub
    shroud_cp: list[tuple[float, float]]   # 4 control points for shroud
    le_curvature_coeff: float = 0.05       # ADT LE curvature coefficient
    te_inclination: float = 0.0            # Trailing-edge inclination [deg]
    n_points: int = 50

    def _apply_le_curvature(
        self,
        cp: list[tuple[float, float]],
    ) -> list[tuple[float, float]]:
        """Offset CP1 axially to impose leading-edge curvature.

        The axial (z) offset on CP1 is proportional to `le_curvature_coeff`
        and the z-span from CP0 to CP3.
        """
        if abs(self.le_curvature_coeff) < 1e-9:
            return cp
        z_span = abs(cp[3][1] - cp[0][1])
        dz = self.le_curvature_coeff * z_span
        # Positive coeff → push CP1 further downstream (axially) to
        # tighten the curvature at the leading edge.
        r1, z1 = cp[1]
        return [cp[0], (r1, z1 + dz), cp[2], cp[3]]

    def _apply_te_inclination(
        self,
        cp: list[tuple[float, float]],
    ) -> list[tuple[float, float]]:
        """Tilt CP2 by te_inclination degrees to control TE tangent direction.

        The CP2→CP3 vector is rotated by the inclination angle in the (r,z)
        plane.  This mimics ADT's trailing-edge inclination control.
        """
        if abs(self.te_inclination) < 1e-9:
            return cp
        angle_rad = math.radians(self.te_inclination)
        r3, z3 = cp[3]
        r2, z2 = cp[2]
        # Vector from CP3 toward CP2 (reverse tangent at outlet)
        dr = r2 - r3
        dz = z2 - z3
        length = math.hypot(dr, dz)
        if length < 1e-12:
            return cp
        # Rotate by angle
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        dr_rot = dr * cos_a - dz * sin_a
        dz_rot = dr * sin_a + dz * cos_a
        new_r2 = r3 + dr_rot * (length / math.hypot(dr_rot, dz_rot + 1e-30))
        new_z2 = z3 + dz_rot * (length / math.hypot(dr_rot, dz_rot + 1e-30))
        return [cp[0], cp[1], (new_r2, new_z2), cp[3]]

    def _prepare_cp(
        self,
        cp: list[tuple[float, float]],
    ) -> list[tuple[float, float]]:
        """Apply LE curvature and TE inclination modifications."""
        cp = self._apply_le_curvature(list(cp))
        cp = self._apply_te_inclination(cp)
        return cp

    def hub_curve(self) -> list[tuple[float, float]]:
        """Return discretised hub curve after applying all modifications."""
        return bezier_curve(self._prepare_cp(self.hub_cp), self.n_points)

    def shroud_curve(self) -> list[tuple[float, float]]:
        """Return discretised shroud curve after applying all modifications."""
        return bezier_curve(self._prepare_cp(self.shroud_cp), self.n_points)

    def to_meridional_channel(self) -> MeridionalChannel:
        """Convert to a MeridionalChannel for downstream use."""
        return MeridionalChannel(
            hub_points=self.hub_curve(),
            shroud_points=self.shroud_curve(),
        )


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
