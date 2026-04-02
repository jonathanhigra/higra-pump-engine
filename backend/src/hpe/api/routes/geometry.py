"""Geometry API routes — 3D visualization and CAD export.

Geometry improvements:
    #9  — target_wrap_angle: iterative beta2 adjustment to hit desired wrap.
    #10 — blade_profile: "logarithmic" (default) | "bezier" (Bézier camber).
    #11 — le_radius / te_radius: non-zero LE/TE thickness via smooth distribution.
    #12 — t_hub / t_shroud: spanwise thickness variation (root-to-tip taper).
    #14 — lean_angle / sweep_angle: stacking law for blade lean and sweep.
"""

from __future__ import annotations

import math
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["geometry"])


class GeometryRequest(BaseModel):
    flow_rate: float = Field(..., gt=0)
    head: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    n_blade_points: int = Field(40, ge=10, le=100)
    n_span_points: int = Field(8, ge=3, le=20)
    # Advanced geometry parameters
    target_wrap_angle: Optional[float] = Field(None, description="Target blade wrap angle [deg] (#9). Typical 100-160.")
    blade_profile: str = Field("logarithmic", description="Blade camber profile: 'logarithmic' | 'bezier' (#10)")
    le_radius: Optional[float] = Field(None, description="Leading edge radius [m] (#11). Default = blade_thickness/4")
    te_radius: Optional[float] = Field(None, description="Trailing edge radius [m] (#11). Default = blade_thickness/6")
    t_hub: Optional[float] = Field(None, description="Blade thickness at hub [m] (#12). Default = blade_thickness")
    t_shroud: Optional[float] = Field(None, description="Blade thickness at shroud [m] (#12). Default = 0.6*blade_thickness")
    lean_angle: float = Field(0.0, description="Blade lean angle [deg] (#14). Tangential stacking offset hub→shroud")
    sweep_angle: float = Field(0.0, description="Blade sweep angle [deg] (#14). Axial stacking offset hub→shroud")


class BladePoint3D(BaseModel):
    x: float
    y: float
    z: float


class BladeSurface(BaseModel):
    ps: List[List[BladePoint3D]]
    ss: List[List[BladePoint3D]]


class ImpellerGeometry(BaseModel):
    blade_surfaces: List[BladeSurface]
    hub_profile: List[BladePoint3D]
    shroud_profile: List[BladePoint3D]
    blade_count: int
    d2: float
    d1: float
    b2: float
    actual_wrap_angle: float = 0.0   # (#9) computed wrap angle of blade 0


# ---------------------------------------------------------------------------
# Meridional curves
# ---------------------------------------------------------------------------

def _meridional_curves(
    r1: float, r1_hub: float, r2: float,
    b1: float, b2: float, n_chord: int,
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """Generate realistic meridional hub/shroud curves for centrifugal impeller.

    Hub: transitions from axial inlet (r=r1_hub, z=z_total) to radial outlet
         (r=r2, z=0) along a quarter-circle arc.
    Shroud: parallels the hub, offset outward by the passage width b(t).

    The axial length is sized proportional to (r2-r1) to give a realistic
    L/D ratio (~0.6-0.8) consistent with Gülich §3.3.
    """
    z_total = 0.72 * (r2 - r1)   # meridional length ≈ 0.72*(r2-r1)
    hub_rz: list[tuple[float, float]] = []
    shroud_rz: list[tuple[float, float]] = []

    for i in range(n_chord):
        t = i / (n_chord - 1)
        # Quarter-circle arc: (sin, cos) → goes from axial to radial smoothly
        arc = math.pi / 2 * t
        sin_a = math.sin(arc)
        cos_a = math.cos(arc)

        # Hub: from (r1_hub, z_total) → (r2, 0)
        r_h = r1_hub + (r2 - r1_hub) * sin_a
        z_h = z_total * cos_a

        # Shroud: from (r1, z_total + b1) → (r2, b2) — tracks hub + passage width
        r_s = r1 + (r2 - r1) * sin_a
        b_t = b1 + t * (b2 - b1)   # passage width tapers from b1 to b2

        # Shroud offset perpendicular to meridional direction
        # For a quarter-circle, the outward normal is (cos_a, sin_a) in (r, z)
        r_sh = r_s + b_t * cos_a
        z_sh = z_h + b_t * sin_a

        hub_rz.append((r_h, z_h))
        shroud_rz.append((r_sh, z_sh))

    return hub_rz, shroud_rz


def _hub_with_shaft(
    hub_rz: list[tuple[float, float]],
    r1_hub: float,
) -> list[tuple[float, float]]:
    """Extend hub profile with a shaft stub for visual completeness.

    Adds a small shaft cylinder at the inlet end of the hub, from
    shaft radius (≈ 0.4*r1_hub) inward, then the hub disc at outlet.
    Returns an extended list of (r, z) points for the revolution surface.
    """
    if not hub_rz:
        return hub_rz
    r_shaft = r1_hub * 0.40
    r_in, z_in = hub_rz[0]
    r_out, z_out = hub_rz[-1]

    # Shaft stub at inlet: horizontal segment from r_shaft to r_in
    shaft = [(r_shaft, z_in + 0.3 * (hub_rz[-1][1] - z_in)), (r_in, z_in)]

    # Hub disc at outlet: flat from r_out back to r_shaft
    disc = [(r_out, z_out), (r_shaft, z_out)]

    return shaft + hub_rz + disc[1:]


# ---------------------------------------------------------------------------
# Thickness distribution (#11)
# ---------------------------------------------------------------------------

def _thickness_at(t: float, t_max: float, le_r: float, te_r: float) -> float:
    """Smooth thickness distribution with non-zero LE/TE (#11).

    Uses a raised cosine blended with a parabolic central profile:
        thick(t) = le_r + (te_r - le_r)*t + t_max * sin(pi*t) * (1 - 0.5*le_r/t_max - 0.5*te_r/t_max)
    Clamped to [0, t_max].
    """
    if t_max <= 0:
        return 0.0
    le = min(le_r, t_max)
    te = min(te_r, t_max)
    # Linear edge baseline
    edge = le + (te - le) * t
    # Parabolic bump in the middle
    bump = t_max * math.sin(math.pi * max(t, 1e-4))
    # Weight down the bump near edges so it does not exceed t_max
    return min(t_max, edge + bump * max(0.0, 1.0 - le / t_max - te / t_max))


# ---------------------------------------------------------------------------
# Camber line integration
# ---------------------------------------------------------------------------

def _integrate_camber_logarithmic(
    hub_rz: list[tuple[float, float]],
    shroud_rz: list[tuple[float, float]],
    beta1_rad: float, beta2_rad: float,
    s: float,  # span fraction 0=hub 1=shroud
) -> list[tuple[float, float, float]]:
    """Build camber (r, z, theta) by logarithmic spiral integration."""
    n = len(hub_rz)
    theta = 0.0
    camber = []
    for i in range(n):
        t = i / (n - 1)
        r = hub_rz[i][0] + s * (shroud_rz[i][0] - hub_rz[i][0])
        z = hub_rz[i][1] + s * (shroud_rz[i][1] - hub_rz[i][1])
        beta = beta1_rad + t * (beta2_rad - beta1_rad)
        camber.append((r, z, theta))
        if i < n - 1:
            r_next = hub_rz[i+1][0] + s * (shroud_rz[i+1][0] - hub_rz[i+1][0])
            dr = r_next - r
            beta_next = beta1_rad + (i + 1) / (n - 1) * (beta2_rad - beta1_rad)
            b_mid = (beta + beta_next) / 2
            r_mid = (r + r_next) / 2
            if abs(math.tan(b_mid)) > 1e-10 and r_mid > 1e-6:
                theta += dr / (r_mid * math.tan(b_mid))
    return camber


def _integrate_camber_bezier(
    hub_rz: list[tuple[float, float]],
    shroud_rz: list[tuple[float, float]],
    beta1_rad: float, beta2_rad: float,
    s: float,
) -> list[tuple[float, float, float]]:
    """Bézier camber line (#10): cubic Bézier wrap angle distribution.

    The wrap angle theta(r) follows a cubic Bézier curve from (r_in, 0) to (r_out, theta_total),
    where theta_total is computed from the logarithmic solution and used as the endpoint.
    The two interior control points are set at 1/3 and 2/3 of the r-range,
    with angles slightly biased toward the leading edge for a more aggressive
    wrap at inlet — typical for high-efficiency pump blades.
    """
    # First, compute the total wrap using logarithmic to anchor the Bezier endpoint
    log_camber = _integrate_camber_logarithmic(hub_rz, shroud_rz, beta1_rad, beta2_rad, s)
    theta_total = log_camber[-1][2]
    n = len(hub_rz)

    # Bézier control points in normalized (t, theta/theta_total) space
    # P0=(0,0), P1=(0.3, 0.15), P2=(0.7, 0.7), P3=(1,1) — S-curve
    def bezier_theta(t_norm: float) -> float:
        p0, p1, p2, p3 = 0.0, 0.15, 0.70, 1.0
        b = (1-t_norm)**3*p0 + 3*(1-t_norm)**2*t_norm*p1 + 3*(1-t_norm)*t_norm**2*p2 + t_norm**3*p3
        return b * theta_total

    camber = []
    for i in range(n):
        t = i / (n - 1)
        r = hub_rz[i][0] + s * (shroud_rz[i][0] - hub_rz[i][0])
        z = hub_rz[i][1] + s * (shroud_rz[i][1] - hub_rz[i][1])
        theta = bezier_theta(t)
        camber.append((r, z, theta))
    return camber


# ---------------------------------------------------------------------------
# Surface generation
# ---------------------------------------------------------------------------

def _build_blade_surface(
    hub_rz: list[tuple[float, float]],
    shroud_rz: list[tuple[float, float]],
    beta1_rad: float, beta2_rad: float,
    blade_thickness: float,
    angular_offset: float,
    n_span: int,
    blade_profile: str = "logarithmic",
    le_radius: float = 0.0,
    te_radius: float = 0.0,
    t_hub: float | None = None,
    t_shroud: float | None = None,
    lean_rad: float = 0.0,    # lean stacking [rad]
    sweep_m: float = 0.0,     # sweep stacking [m]
) -> BladeSurface:
    t_hub_v = t_hub if t_hub is not None else blade_thickness
    t_shroud_v = t_shroud if t_shroud is not None else blade_thickness * 0.6

    ps_surface: list[list[BladePoint3D]] = []
    ss_surface: list[list[BladePoint3D]] = []

    for k in range(n_span):
        s = k / (n_span - 1)

        # Spanwise thickness (#12)
        t_max = t_hub_v + s * (t_shroud_v - t_hub_v)

        # Choose camber integration method (#10)
        if blade_profile == "bezier":
            camber = _integrate_camber_bezier(hub_rz, shroud_rz, beta1_rad, beta2_rad, s)
        else:
            camber = _integrate_camber_logarithmic(hub_rz, shroud_rz, beta1_rad, beta2_rad, s)

        # Stacking offsets (#14)
        lean_offset = lean_rad * s
        n_chord = len(camber)

        ps_row, ss_row = [], []
        for i, (r, z, theta_c) in enumerate(camber):
            t_norm = i / (n_chord - 1)

            # Thickness at this chord station (#11)
            thick = _thickness_at(t_norm, t_max, le_radius, te_radius)
            d_theta = thick / (2.0 * r) if r > 1e-10 else 0.0

            # Lean + sweep stacking (#14)
            z_offset = sweep_m * s
            angle = theta_c + angular_offset + lean_offset

            ps_row.append(BladePoint3D(
                x=r * math.cos(angle - d_theta) * 1000,
                y=r * math.sin(angle - d_theta) * 1000,
                z=(z + z_offset) * 1000,
            ))
            ss_row.append(BladePoint3D(
                x=r * math.cos(angle + d_theta) * 1000,
                y=r * math.sin(angle + d_theta) * 1000,
                z=(z + z_offset) * 1000,
            ))

        ps_surface.append(ps_row)
        ss_surface.append(ss_row)

    return BladeSurface(ps=ps_surface, ss=ss_surface)


def _compute_wrap_angle(
    hub_rz: list[tuple[float, float]],
    shroud_rz: list[tuple[float, float]],
    beta1_rad: float, beta2_rad: float,
) -> float:
    """Compute wrap angle [deg] at mid-span for camber diagnostics (#9)."""
    camber = _integrate_camber_logarithmic(hub_rz, shroud_rz, beta1_rad, beta2_rad, 0.5)
    return math.degrees(camber[-1][2])


def _adjust_beta2_for_wrap(
    hub_rz, shroud_rz, beta1_rad: float, beta2_rad: float,
    target_wrap_rad: float, max_iter: int = 12,
) -> float:
    """Bisection search on beta2 to achieve target wrap angle (#9)."""
    lo, hi = math.radians(15.0), math.radians(45.0)
    for _ in range(max_iter):
        mid = (lo + hi) / 2
        w = math.radians(_compute_wrap_angle(hub_rz, shroud_rz, beta1_rad, mid))
        if abs(w - target_wrap_rad) < math.radians(0.5):
            return mid
        # Higher beta2 → smaller wrap angle (more radial blade)
        if w > target_wrap_rad:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _revolution_profile(rz_curve: list[tuple[float, float]]) -> list[BladePoint3D]:
    return [BladePoint3D(x=r * 1000, y=0.0, z=z * 1000) for r, z in rz_curve]


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------

@router.post("/geometry/impeller", response_model=ImpellerGeometry)
def get_impeller_geometry(req: GeometryRequest) -> ImpellerGeometry:
    """Generate 3D blade surfaces with advanced geometry parameters."""
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing
    from hpe.constants import BLADE_THICKNESS_RATIO

    op = OperatingPoint(flow_rate=req.flow_rate, head=req.head, rpm=req.rpm)
    sizing = run_sizing(op)

    mp = sizing.meridional_profile
    d1 = sizing.impeller_d1
    d2 = sizing.impeller_d2
    b2 = sizing.impeller_b2
    b1 = float(mp.get("b1", b2 * 1.2))
    r1 = d1 / 2.0
    r1_hub = float(mp.get("d1_hub", d1 * 0.35)) / 2.0
    r2 = d2 / 2.0

    blade_thickness = max(0.002, min(0.008, d2 * BLADE_THICKNESS_RATIO))

    beta1_rad = math.radians(sizing.beta1)
    beta2_rad = math.radians(sizing.beta2)

    n_chord = req.n_blade_points
    n_span = req.n_span_points

    hub_rz, shroud_rz = _meridional_curves(r1, r1_hub, r2, b1, b2, n_chord)
    hub_rz_visual = _hub_with_shaft(hub_rz, r1_hub)

    # #9 — wrap angle targeting
    if req.target_wrap_angle is not None:
        target_rad = math.radians(req.target_wrap_angle)
        beta2_rad = _adjust_beta2_for_wrap(hub_rz, shroud_rz, beta1_rad, beta2_rad, target_rad)

    # Resolve advanced thickness (#11, #12)
    le_r = req.le_radius if req.le_radius is not None else blade_thickness / 4.0
    te_r = req.te_radius if req.te_radius is not None else blade_thickness / 6.0
    t_hub = req.t_hub
    t_shroud = req.t_shroud

    # Stacking (#14)
    lean_rad = math.radians(req.lean_angle)
    sweep_m = math.tan(math.radians(req.sweep_angle)) * b2 if req.sweep_angle != 0 else 0.0

    pitch = 2.0 * math.pi / sizing.blade_count
    blade_surfaces: list[BladeSurface] = []
    for b in range(sizing.blade_count):
        surf = _build_blade_surface(
            hub_rz, shroud_rz,
            beta1_rad, beta2_rad,
            blade_thickness,
            angular_offset=b * pitch,
            n_span=n_span,
            blade_profile=req.blade_profile,
            le_radius=le_r,
            te_radius=te_r,
            t_hub=t_hub,
            t_shroud=t_shroud,
            lean_rad=lean_rad,
            sweep_m=sweep_m,
        )
        blade_surfaces.append(surf)

    actual_wrap = _compute_wrap_angle(hub_rz, shroud_rz, beta1_rad, beta2_rad)

    return ImpellerGeometry(
        blade_surfaces=blade_surfaces,
        hub_profile=_revolution_profile(hub_rz_visual),
        shroud_profile=_revolution_profile(shroud_rz),
        blade_count=sizing.blade_count,
        d2=d2, d1=d1, b2=b2,
        actual_wrap_angle=actual_wrap,
    )


# ---------------------------------------------------------------------------
# Blade quality endpoint (B9)
# ---------------------------------------------------------------------------

@router.get("/geometry/quality")
def get_geometry_quality(
    flow_rate: float,
    head: float,
    rpm: float,
    wrap_hub: float = 0.0,
    wrap_shr: float = 0.0,
) -> dict:
    """Return blade geometric quality metrics for a design point (B9).

    Runs 1D sizing to obtain impeller geometry, then evaluates blade
    quality indicators: wrap variation, minimum passage, curvature
    coefficient, LE bow, sweep, lean angles, and a composite score.

    Args:
        flow_rate: Q [m³/s].
        head: H [m].
        rpm: Rotational speed [RPM].
        wrap_hub: Wrap angle at hub [deg] (0 = auto-estimated from geometry).
        wrap_shr: Wrap angle at shroud [deg] (0 = auto-estimated).

    Returns:
        BladeQualityMetrics fields plus impeller geometry context.
    """
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing
    from hpe.geometry.runner.quality import calc_blade_quality

    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    sizing = run_sizing(op)

    metrics = calc_blade_quality(
        d2=sizing.impeller_d2,
        d1=sizing.impeller_d1,
        b2=sizing.impeller_b2,
        blade_count=sizing.blade_count,
        beta2=sizing.beta2,
        beta1=sizing.beta1,
        wrap_hub=wrap_hub,
        wrap_shr=wrap_shr,
    )

    return {
        "wrap_angle_variation_deg": metrics.wrap_angle_variation,
        "channel_min_distance_m": metrics.channel_min_distance,
        "curvature_variation_coeff": metrics.curvature_variation_coeff,
        "le_bow_ratio": metrics.le_bow_ratio,
        "le_sweep_deg": metrics.le_sweep_deg,
        "max_lean_deg": metrics.max_lean_deg,
        "avg_lean_deg": metrics.avg_lean_deg,
        "quality_score": metrics.quality_score,
        "warnings": metrics.warnings,
        # Context
        "d2_m": sizing.impeller_d2,
        "d1_m": sizing.impeller_d1,
        "b2_m": sizing.impeller_b2,
        "blade_count": sizing.blade_count,
        "beta1_deg": sizing.beta1,
        "beta2_deg": sizing.beta2,
    }


# ---------------------------------------------------------------------------
# Meridional Bezier endpoint (A3)
# ---------------------------------------------------------------------------

class BezierControlPointInput(BaseModel):
    r: float = Field(..., description="Radial coordinate [m]")
    z: float = Field(..., description="Axial coordinate [m]")


class BezierMeridionalRequest(BaseModel):
    hub_cp: List[BezierControlPointInput] = Field(
        ..., min_length=4, max_length=4,
        description="4 Bézier control points for the hub curve (r,z) [m]",
    )
    shroud_cp: List[BezierControlPointInput] = Field(
        ..., min_length=4, max_length=4,
        description="4 Bézier control points for the shroud curve (r,z) [m]",
    )
    le_curvature_coeff: float = Field(
        0.05, ge=0.0, le=0.30,
        description="Leading-edge curvature coefficient (ADT LE CURVATURE COEFF). Range 0–0.30.",
    )
    te_inclination: float = Field(
        0.0, ge=-45.0, le=45.0,
        description="Trailing-edge inclination angle [deg]. Positive = more radial TE.",
    )
    n_points: int = Field(50, ge=10, le=200, description="Number of discretisation points per curve.")


class BezierMeridionalResponse(BaseModel):
    hub_curve: List[dict]     # list of {"r": float, "z": float}
    shroud_curve: List[dict]


@router.post("/geometry/meridional/bezier", response_model=BezierMeridionalResponse)
def meridional_bezier_endpoint(req: BezierMeridionalRequest) -> BezierMeridionalResponse:
    """Generate hub and shroud meridional curves from 4 Bézier control points each.

    Supports leading-edge curvature coefficient and trailing-edge inclination,
    matching ADT TURBOdesign1 ADVANCED IMPELLER MERIDIONAL parameterisation.
    """
    from hpe.geometry.runner.meridional_advanced import BezierMeridional

    hub_cp = [(p.r, p.z) for p in req.hub_cp]
    shroud_cp = [(p.r, p.z) for p in req.shroud_cp]

    bm = BezierMeridional(
        hub_cp=hub_cp,
        shroud_cp=shroud_cp,
        le_curvature_coeff=req.le_curvature_coeff,
        te_inclination=req.te_inclination,
        n_points=req.n_points,
    )

    hub_pts = [{"r": r, "z": z} for r, z in bm.hub_curve()]
    shroud_pts = [{"r": r, "z": z} for r, z in bm.shroud_curve()]

    return BezierMeridionalResponse(hub_curve=hub_pts, shroud_curve=shroud_pts)


# ---------------------------------------------------------------------------
# Volute 2D flow solver endpoint (D1–D5)
# ---------------------------------------------------------------------------

class VolSolveRequest(BaseModel):
    """Request body for the volute flow solver."""
    # VoluteGeometry fields
    r2: float = Field(..., gt=0, description="Impeller outlet radius [m]")
    b2: float = Field(..., gt=0, description="Impeller outlet width [m]")
    r3: float = Field(..., gt=0, description="Cutwater (tongue) radius [m]")
    section_type: str = Field("SEMICIRCLE", description="Cross-section type: SEMICIRCLE | ELLIPSE | RECTANGLE | TRAPEZOID")
    volute_type: str = Field("single_radial", description="Volute type: single_radial | single_tangential | double | semi_double | asymmetric_ext | double_entry | axial_entry")
    semi_major: float = Field(0.0, ge=0, description="Ellipse major axis [m]")
    semi_minor: float = Field(0.0, ge=0, description="Ellipse minor axis [m]")
    rect_width: float = Field(0.0, ge=0, description="Rectangle width [m]")
    rect_height: float = Field(0.0, ge=0, description="Rectangle height [m]")
    tongue_radius: float = Field(0.002, gt=0, description="Tongue fillet radius [m]")
    tube_length: float = Field(0.2, gt=0, description="Discharge tube length [m]")
    tube_diameter: float = Field(0.08, gt=0, description="Discharge tube diameter [m]")
    tube_angle_deg: float = Field(0.0, description="Discharge tube angle [deg]")
    rho: float = Field(998.0, gt=0, description="Fluid density [kg/m³]")
    # Operating point
    flow_rate: float = Field(..., gt=0, description="Flow rate Q [m³/s]")
    head: float = Field(..., gt=0, description="Pump head H [m]")
    rpm: float = Field(..., gt=0, description="Rotational speed [rpm]")


@router.post("/geometry/volute/solve")
def solve_volute_endpoint(req: VolSolveRequest) -> dict:
    """Solve volute 2D flow and compute performance (Gülich 2014 §7.5).

    Returns total head loss, static pressure recovery coefficient,
    throat area, angular section velocities, and loss coefficient.
    Supports SEMICIRCLE, ELLIPSE, RECTANGLE, and TRAPEZOID cross-sections,
    and all seven volute types (single/double/tangential/axial-entry, etc.).
    """
    from hpe.physics.volute_solver import (
        CrossSectionType, VoluteGeometry, VoluteType, solve_volute,
    )

    try:
        section_type = CrossSectionType(req.section_type.upper())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown section_type '{req.section_type}'. "
                   f"Choose from: {[e.value for e in CrossSectionType]}",
        )

    try:
        volute_type = VoluteType(req.volute_type.lower())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown volute_type '{req.volute_type}'. "
                   f"Choose from: {[e.value for e in VoluteType]}",
        )

    geom = VoluteGeometry(
        r2=req.r2,
        b2=req.b2,
        r3=req.r3,
        section_type=section_type,
        volute_type=volute_type,
        semi_major=req.semi_major,
        semi_minor=req.semi_minor,
        rect_width=req.rect_width,
        rect_height=req.rect_height,
        tongue_radius=req.tongue_radius,
        tube_length=req.tube_length,
        tube_diameter=req.tube_diameter,
        tube_angle_deg=req.tube_angle_deg,
        rho=req.rho,
    )

    result = solve_volute(volute=geom, flow_rate=req.flow_rate, head=req.head, rpm=req.rpm)

    return {
        "total_head_loss_m": result.total_head_loss_m,
        "static_pressure_recovery": result.static_pressure_recovery,
        "throat_area_m2": result.throat_area_m2,
        "scroll_exit_area_m2": result.scroll_exit_area_m2,
        "mean_velocity_ms": result.mean_velocity_ms,
        "discharge_velocity_ms": result.discharge_velocity_ms,
        "loss_coefficient": result.loss_coefficient,
        "sections": result.sections,
    }


# ---------------------------------------------------------------------------
# G1 — Structured .geo export endpoint
# ---------------------------------------------------------------------------

@router.get("/geometry/export/geo")
def export_geo_endpoint(flow_rate: float, head: float, rpm: float, unit: str = "m") -> dict:
    """Export blade in structured .geo format (BladeGen / TurboGrid).

    Runs 1D sizing to derive impeller geometry, then produces (X, R, theta)
    coordinate tables for both pressure and suction surfaces at n_span=5
    spanwise positions and n_chord=21 chordwise stations.

    Args:
        flow_rate: Q [m³/s].
        head: H [m].
        rpm: Rotational speed [RPM].
        unit: Output unit for coordinates, "m" or "mm".

    Returns:
        Dict with 'ps', 'ss' (.geo file contents), 'format', 'n_span', 'n_chord'.
    """
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing
    from hpe.geometry.runner.export import export_geo_both_surfaces

    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    s = run_sizing(op)
    return export_geo_both_surfaces(
        d2=s.impeller_d2,
        d1=s.impeller_d1,
        b2=s.impeller_b2,
        beta1=s.beta1,
        beta2=s.beta2,
        blade_count=s.blade_count,
        unit=unit,
    )


# ---------------------------------------------------------------------------
# G2 — BladeGen .inf + .curve export endpoint
# ---------------------------------------------------------------------------

@router.get("/geometry/export/bladegen")
def export_bladegen_endpoint(flow_rate: float, head: float, rpm: float) -> dict:
    """Export blade in ANSYS BladeGen .inf + .curve format.

    Runs 1D sizing to derive impeller geometry, then produces:
    - An .inf file with machine type, rotation axis, and span definitions.
    - A .curve file with (m', theta_deg) blade wrap coordinates per span.

    Args:
        flow_rate: Q [m³/s].
        head: H [m].
        rpm: Rotational speed [RPM].

    Returns:
        Dict with 'inf' (.inf file content), 'curve' (.curve file content),
        and 'format' = "bladegen".
    """
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing
    from hpe.geometry.runner.export import export_bladegen_curve, export_bladegen_inf

    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    s = run_sizing(op)
    return {
        "inf": export_bladegen_inf(
            d2=s.impeller_d2,
            d1=s.impeller_d1,
            b2=s.impeller_b2,
            beta1=s.beta1,
            beta2=s.beta2,
            blade_count=s.blade_count,
            rpm=rpm,
        ),
        "curve": export_bladegen_curve(
            d2=s.impeller_d2,
            d1=s.impeller_d1,
            b2=s.impeller_b2,
            beta1=s.beta1,
            beta2=s.beta2,
            blade_count=s.blade_count,
        ),
        "format": "bladegen",
    }


# ---------------------------------------------------------------------------
# Export endpoint (unchanged)
# ---------------------------------------------------------------------------

class ExportRequest(BaseModel):
    flow_rate: float = Field(..., gt=0)
    head: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    format: str = Field("step", description="step | stl | iges")


@router.post("/geometry/export")
def export_geometry(req: ExportRequest):
    """Export impeller geometry as STEP, STL, or IGES file."""
    try:
        from hpe.core.models import OperatingPoint
        from hpe.geometry.models import RunnerGeometryParams
        from hpe.geometry.runner.impeller import generate_runner
        from hpe.geometry.runner.export import export_runner
        from hpe.core.enums import GeometryFormat
        from hpe.sizing.meanline import run_sizing
    except ImportError:
        raise HTTPException(status_code=501, detail="CadQuery not installed.")

    op = OperatingPoint(flow_rate=req.flow_rate, head=req.head, rpm=req.rpm)
    sizing = run_sizing(op)
    params = RunnerGeometryParams.from_sizing_result(sizing)
    runner = generate_runner(params)

    fmt_map = {"step": GeometryFormat.STEP, "stl": GeometryFormat.STL, "iges": GeometryFormat.IGES}
    fmt = fmt_map.get(req.format.lower())
    if fmt is None:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {req.format}")

    ext_map = {"step": ".step", "stl": ".stl", "iges": ".iges"}
    tmp = tempfile.NamedTemporaryFile(suffix=ext_map[req.format.lower()], delete=False)
    tmp.close()
    export_runner(runner, tmp.name, fmt=fmt)

    media_types = {"step": "application/step", "stl": "application/sla", "iges": "application/iges"}
    return FileResponse(
        path=tmp.name,
        filename=f"impeller_Q{req.flow_rate:.4f}_H{req.head:.1f}{ext_map[req.format.lower()]}",
        media_type=media_types.get(req.format.lower(), "application/octet-stream"),
    )
