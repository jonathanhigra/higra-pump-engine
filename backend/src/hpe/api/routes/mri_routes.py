"""Meridional (MRI) generator API routes.

Endpoints:
    POST /api/v1/meridional/generate     — generate from parameters
    POST /api/v1/meridional/from_sizing  — auto-generate from sizing result
    GET  /api/v1/meridional/templates    — list available templates
    POST /api/v1/meridional/validate     — validate geometry
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hpe.geometry.meridional.mri_generator import (
    MRIGenerator,
    MRIParams,
    MRITemplate,
)

router = APIRouter(prefix="/api/v1/meridional", tags=["meridional"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class MeridionalGenerateRequest(BaseModel):
    """Parameters for meridional profile generation."""

    inlet_radius: float = Field(..., gt=0, description="Inlet (shroud tip) radius [m]")
    outlet_radius: float = Field(..., gt=0, description="Outlet (impeller exit) radius [m]")
    axial_length: float = Field(..., gt=0, description="Total axial extent [m]")
    hub_curvature: float = Field(0.5, ge=0, le=1)
    shroud_curvature: float = Field(0.5, ge=0, le=1)
    inlet_angle_hub: float = Field(90.0, ge=0, le=180)
    inlet_angle_shroud: float = Field(90.0, ge=0, le=180)
    outlet_angle_hub: float = Field(90.0, ge=0, le=180)
    outlet_angle_shroud: float = Field(90.0, ge=0, le=180)
    hub_inlet_radius: float = Field(0.0, ge=0, description="Hub r at inlet (shaft). 0 = auto")
    passage_width_inlet: float = Field(0.0, ge=0, description="b1 at inlet. 0 = auto")
    n_points: int = Field(50, ge=10, le=500)


class MeridionalFromSizingRequest(BaseModel):
    """Auto-generate meridional from sizing dimensions."""

    impeller_d1: float = Field(0.0, ge=0, description="Inlet diameter [m]. 0 = auto")
    impeller_d2: float = Field(..., gt=0, description="Outlet diameter [m]")
    impeller_b1: float = Field(0.0, ge=0, description="Inlet width [m]. 0 = auto")
    impeller_b2: float = Field(..., gt=0, description="Outlet width [m]")
    shaft_diameter: float = Field(0.0, ge=0, description="Shaft diameter [m]. 0 = auto")
    n_points: int = Field(50, ge=10, le=500)


class MeridionalValidateRequest(MeridionalGenerateRequest):
    """Same params as generate, returns validation diagnostics."""
    pass


class ProfileResponse(BaseModel):
    hub_rz: List[List[float]]
    shroud_rz: List[List[float]]
    n_points: int


class TemplateInfo(BaseModel):
    name: str
    description: str


class TemplatesResponse(BaseModel):
    templates: List[TemplateInfo]


class ValidationResponse(BaseModel):
    valid: bool
    errors: List[str]
    warnings: List[str]
    min_passage_width: float
    max_curvature_hub: float
    max_curvature_shroud: float


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=ProfileResponse)
def generate_meridional(req: MeridionalGenerateRequest) -> ProfileResponse:
    """Generate meridional hub/shroud curves from parameters."""
    try:
        params = MRIParams(
            inlet_radius=req.inlet_radius,
            outlet_radius=req.outlet_radius,
            axial_length=req.axial_length,
            hub_curvature=req.hub_curvature,
            shroud_curvature=req.shroud_curvature,
            inlet_angle_hub=req.inlet_angle_hub,
            inlet_angle_shroud=req.inlet_angle_shroud,
            outlet_angle_hub=req.outlet_angle_hub,
            outlet_angle_shroud=req.outlet_angle_shroud,
            hub_inlet_radius=req.hub_inlet_radius,
            passage_width_inlet=req.passage_width_inlet,
        )
        gen = MRIGenerator(params)
        profile = gen.generate(n_points=req.n_points)

        return ProfileResponse(
            hub_rz=profile.hub_rz.tolist(),
            shroud_rz=profile.shroud_rz.tolist(),
            n_points=profile.n_points,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/from_sizing", response_model=ProfileResponse)
def generate_from_sizing(req: MeridionalFromSizingRequest) -> ProfileResponse:
    """Auto-generate meridional from sizing result dimensions."""
    try:
        # Build a simple namespace so from_sizing_result can read attributes
        class _Sizing:
            pass

        s = _Sizing()
        s.impeller_d1 = req.impeller_d1  # type: ignore[attr-defined]
        s.impeller_d2 = req.impeller_d2  # type: ignore[attr-defined]
        s.impeller_b1 = req.impeller_b1  # type: ignore[attr-defined]
        s.impeller_b2 = req.impeller_b2  # type: ignore[attr-defined]
        s.shaft_diameter = req.shaft_diameter  # type: ignore[attr-defined]

        gen = MRIGenerator.from_sizing_result(s)
        profile = gen.generate(n_points=req.n_points)

        return ProfileResponse(
            hub_rz=profile.hub_rz.tolist(),
            shroud_rz=profile.shroud_rz.tolist(),
            n_points=profile.n_points,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/templates", response_model=TemplatesResponse)
def list_templates() -> TemplatesResponse:
    """List available meridional profile templates."""
    descriptions = {
        MRITemplate.RADIAL_PUMP: "Standard centrifugal pump meridional (L/D2 ~ 0.3)",
        MRITemplate.MIXED_FLOW: "Mixed-flow pump with 45-deg exit (L/D2 ~ 0.5)",
        MRITemplate.FRANCIS_TURBINE: "Francis turbine — high wrap, wide inlet (L/D2 ~ 0.7)",
        MRITemplate.AXIAL: "Axial machine — cylindrical annulus (constant radius)",
    }
    templates = [
        TemplateInfo(name=t.value, description=descriptions.get(t, ""))
        for t in MRITemplate
    ]
    return TemplatesResponse(templates=templates)


@router.post("/validate", response_model=ValidationResponse)
def validate_meridional(req: MeridionalValidateRequest) -> ValidationResponse:
    """Validate meridional geometry for intersections and curvature."""
    try:
        params = MRIParams(
            inlet_radius=req.inlet_radius,
            outlet_radius=req.outlet_radius,
            axial_length=req.axial_length,
            hub_curvature=req.hub_curvature,
            shroud_curvature=req.shroud_curvature,
            inlet_angle_hub=req.inlet_angle_hub,
            inlet_angle_shroud=req.inlet_angle_shroud,
            outlet_angle_hub=req.outlet_angle_hub,
            outlet_angle_shroud=req.outlet_angle_shroud,
            hub_inlet_radius=req.hub_inlet_radius,
            passage_width_inlet=req.passage_width_inlet,
        )
        gen = MRIGenerator(params)
        result = gen.validate(n_points=req.n_points)

        return ValidationResponse(
            valid=result.valid,
            errors=result.errors,
            warnings=result.warnings,
            min_passage_width=result.min_passage_width,
            max_curvature_hub=result.max_curvature_hub,
            max_curvature_shroud=result.max_curvature_shroud,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
