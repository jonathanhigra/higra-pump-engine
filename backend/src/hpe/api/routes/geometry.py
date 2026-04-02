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
    z_total = 0.8 * (r2 - r1)
    hub_rz, shroud_rz = [], []
    for i in range(n_chord):
        t = i / (n_chord - 1)
        arc = math.pi / 2 * t
        r_h = r1_hub + (r2 - r1_hub) * math.sin(arc)
        z_h = z_total * (1.0 - math.sin(arc))
        r_s = r1 + (r2 - r1) * math.sin(arc)
        b_l = b1 + t * (b2 - b1)
        hub_rz.append((r_h, z_h))
        shroud_rz.append((r_s, z_h + b_l))
    return hub_rz, shroud_rz


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
        hub_profile=_revolution_profile(hub_rz),
        shroud_profile=_revolution_profile(shroud_rz),
        blade_count=sizing.blade_count,
        d2=d2, d1=d1, b2=b2,
        actual_wrap_angle=actual_wrap,
    )


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
