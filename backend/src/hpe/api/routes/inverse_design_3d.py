"""3D inverse blade design API routes — Zangeneh prescribed-vorticity method.

Endpoints:
    POST /api/v1/inverse/zangeneh        — full spec, returns 3D blade geometry
    POST /api/v1/inverse/zangeneh/quick  — auto-generates spec from operating point
    GET  /api/v1/inverse/zangeneh/loading_templates — available loading templates
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/inverse", tags=["inverse-design-3d"])


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------

class SpanLoadingDefModel(BaseModel):
    """Prescribed rVtheta loading at one spanwise station."""

    span_fraction: float = Field(
        0.5, ge=0.0, le=1.0,
        description="Position from hub (0) to shroud (1).",
    )
    nc: float = Field(
        0.20, ge=0.01, le=0.49,
        description="Normalised chord position of max loading gradient (LE side).",
    )
    nd: float = Field(
        0.80, ge=0.03, le=0.99,
        description="Normalised chord position of plateau end (TE side).",
    )
    rvt_inlet: float = Field(
        0.0,
        description="rVtheta at leading edge [m^2/s]. 0 for no pre-swirl.",
    )
    rvt_outlet: float = Field(
        1.0, gt=0.0,
        description="rVtheta at trailing edge [m^2/s]. From Euler equation.",
    )


class ZangenehRequest(BaseModel):
    """Full specification for the Zangeneh 3D inverse design solver."""

    n_streamlines: int = Field(
        5, ge=3, le=11,
        description="Number of spanwise stations (hub to shroud).",
    )
    loading_type: str = Field(
        "mid",
        description="Default loading shape: front, mid, or aft.",
    )
    loading_defs: Optional[List[SpanLoadingDefModel]] = Field(
        None,
        description=(
            "Per-span loading definitions. If omitted, auto-generated "
            "from loading_type and operating point."
        ),
    )

    # Meridional channel
    hub_rz: Optional[List[Tuple[float, float]]] = Field(
        None,
        description="Hub meridional profile as (r, z) points [m]. Auto-generated if omitted.",
    )
    shroud_rz: Optional[List[Tuple[float, float]]] = Field(
        None,
        description="Shroud meridional profile as (r, z) points [m]. Auto-generated if omitted.",
    )

    # Operating point
    flow_rate: float = Field(..., gt=0.0, description="Volumetric flow rate Q [m^3/s].")
    head: float = Field(..., gt=0.0, description="Design head H [m].")
    rpm: float = Field(..., gt=0.0, description="Rotational speed [rev/min].")
    blade_count: int = Field(7, ge=3, le=30, description="Number of blades.")

    # Discretisation
    n_meridional: int = Field(51, ge=11, le=201, description="Chordwise points.")

    # Solver
    max_iterations: int = Field(50, ge=1, le=200, description="Max solver iterations.")
    tolerance: float = Field(1e-4, gt=0.0, description="Convergence tolerance [rad].")

    # Physics
    blockage_factor: float = Field(0.88, ge=0.5, le=1.0, description="Passage blockage factor.")
    rho: float = Field(998.0, gt=0.0, description="Fluid density [kg/m^3].")


class ZangenehQuickRequest(BaseModel):
    """Minimal request for quick auto-generated design."""

    flow_rate: float = Field(..., gt=0.0, description="Q [m^3/s].")
    head: float = Field(..., gt=0.0, description="H [m].")
    rpm: float = Field(..., gt=0.0, description="Rotational speed [rev/min].")
    blade_count: int = Field(7, ge=3, le=30, description="Number of blades.")
    loading_type: str = Field("mid", description="front, mid, or aft.")
    n_streamlines: int = Field(5, ge=3, le=11, description="Spanwise stations.")


class VelocityDistribution(BaseModel):
    """Velocity triangle components along the chord at one span."""

    cm: List[float]
    cu: List[float]
    wu: List[float]
    w: List[float]
    beta: List[float]


class ZangenehResponse(BaseModel):
    """Response from the Zangeneh 3D inverse design solver."""

    # Blade geometry
    blade_angles: List[List[float]] = Field(
        ..., description="beta [deg] at each (span, chord).",
    )
    wrap_angles: List[List[float]] = Field(
        ..., description="theta [rad] at each (span, chord).",
    )
    camber_lines: List[List[List[float]]] = Field(
        ..., description="(r, theta, z) per span per chord point.",
    )

    # Convergence
    convergence_history: List[float]
    converged: bool
    iterations: int

    # Streamline coordinates
    streamline_coordinates: List[List[List[float]]] = Field(
        ..., description="(r, z) per span per chord point.",
    )

    # Velocity distributions
    velocity_distributions: List[VelocityDistribution]

    # Derived
    wrap_angle_total: List[float] = Field(
        ..., description="Total wrap angle per span [deg].",
    )
    rvt_distributions: List[List[float]] = Field(
        ..., description="rVtheta(m) per span [m^2/s].",
    )
    meridional_coords: List[List[float]] = Field(
        ..., description="Normalised m per span.",
    )


class LoadingTemplateModel(BaseModel):
    """A loading distribution template."""

    name: str
    description: str
    hub: Dict[str, float]
    shroud: Dict[str, float]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/zangeneh", response_model=ZangenehResponse)
def zangeneh_full(req: ZangenehRequest) -> ZangenehResponse:
    """Run the Zangeneh 3D inverse blade design solver with full specification.

    Accepts meridional channel geometry, operating point, and loading
    definitions. Returns full 3D blade geometry with velocity distributions
    and convergence diagnostics.
    """
    from hpe.geometry.inverse.zangeneh import (
        SpanLoadingDef,
        ZangenehLoadingType,
        ZangenehSpec,
        zangeneh_inverse_design,
    )

    # Validate loading_type
    try:
        lt = ZangenehLoadingType(req.loading_type)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid loading_type '{req.loading_type}'. Must be one of: front, mid, aft.",
        )

    # Convert loading defs
    loading_defs: list[SpanLoadingDef] = []
    if req.loading_defs:
        for ld in req.loading_defs:
            loading_defs.append(SpanLoadingDef(
                span_fraction=ld.span_fraction,
                nc=ld.nc,
                nd=ld.nd,
                rvt_inlet=ld.rvt_inlet,
                rvt_outlet=ld.rvt_outlet,
            ))

    spec = ZangenehSpec(
        n_streamlines=req.n_streamlines,
        loading_type=lt,
        loading_defs=loading_defs,
        hub_rz=req.hub_rz or [],
        shroud_rz=req.shroud_rz or [],
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        blade_count=req.blade_count,
        n_meridional=req.n_meridional,
        max_iterations=req.max_iterations,
        tolerance=req.tolerance,
        blockage_factor=req.blockage_factor,
        rho=req.rho,
    )

    try:
        result = zangeneh_inverse_design(spec)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Solver error: {exc}")

    return _to_response(result)


@router.post("/zangeneh/quick", response_model=ZangenehResponse)
def zangeneh_quick(req: ZangenehQuickRequest) -> ZangenehResponse:
    """Quick Zangeneh design from operating point and loading type.

    Auto-generates meridional channel geometry and loading definitions
    from pump design correlations (Gulich, Stepanoff).
    """
    from hpe.geometry.inverse.zangeneh import (
        ZangenehLoadingType,
        zangeneh_quick_design,
    )

    try:
        lt = ZangenehLoadingType(req.loading_type)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid loading_type '{req.loading_type}'. Must be one of: front, mid, aft.",
        )

    try:
        result = zangeneh_quick_design(
            flow_rate=req.flow_rate,
            head=req.head,
            rpm=req.rpm,
            blade_count=req.blade_count,
            loading_type=lt,
            n_streamlines=req.n_streamlines,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Solver error: {exc}")

    return _to_response(result)


@router.get("/zangeneh/loading_templates", response_model=List[LoadingTemplateModel])
def zangeneh_loading_templates() -> list[LoadingTemplateModel]:
    """Return available loading distribution templates.

    Each template has a name, description, and default nc/nd values
    for hub and shroud that can be used as starting points.
    """
    from hpe.geometry.inverse.zangeneh import get_loading_templates

    templates = get_loading_templates()
    return [LoadingTemplateModel(**t) for t in templates]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_response(result: object) -> ZangenehResponse:
    """Convert ZangenehResult to ZangenehResponse."""
    # Flatten camber_lines from list[list[tuple]] to list[list[list[float]]]
    camber_flat = [
        [[pt[0], pt[1], pt[2]] for pt in span]
        for span in result.camber_lines  # type: ignore[attr-defined]
    ]

    # Flatten streamline_coordinates
    streamline_flat = [
        [[pt[0], pt[1]] for pt in span]
        for span in result.streamline_coordinates  # type: ignore[attr-defined]
    ]

    # Convert velocity distributions
    vel_dists = [
        VelocityDistribution(**vd)
        for vd in result.velocity_distributions  # type: ignore[attr-defined]
    ]

    return ZangenehResponse(
        blade_angles=result.blade_angles,  # type: ignore[attr-defined]
        wrap_angles=result.wrap_angles,  # type: ignore[attr-defined]
        camber_lines=camber_flat,
        convergence_history=result.convergence_history,  # type: ignore[attr-defined]
        converged=result.converged,  # type: ignore[attr-defined]
        iterations=result.iterations,  # type: ignore[attr-defined]
        streamline_coordinates=streamline_flat,
        velocity_distributions=vel_dists,
        wrap_angle_total=result.wrap_angle_total,  # type: ignore[attr-defined]
        rvt_distributions=result.rvt_distributions,  # type: ignore[attr-defined]
        meridional_coords=result.meridional_coords,  # type: ignore[attr-defined]
    )
