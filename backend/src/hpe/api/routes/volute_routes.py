"""Volute design API routes — advanced volute types and shell generation.

Endpoints:
    POST /api/v1/volute/double       — double (twin-entry) volute design
    POST /api/v1/volute/rectangular  — rectangular cross-section volute
    POST /api/v1/volute/axial_entry  — axial-entry volute
    POST /api/v1/volute/shell        — add wall thickness to a volute
    POST /api/v1/volute/sections     — export cross-section data at each station
"""

from __future__ import annotations

from typing import List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hpe.geometry.volute.models import VoluteParams, CrossSectionType
from hpe.geometry.volute.sizing import size_volute
from hpe.geometry.volute.advanced_volute import (
    DoubleVolute,
    DoubleVoluteConfig,
    RectangularVolute,
    RectangularVoluteConfig,
    AxialEntryVolute,
    AxialEntryVoluteConfig,
    VoluteShell,
    VoluteShellConfig,
)

router = APIRouter(prefix="/api/v1/volute", tags=["volute"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class VoluteBaseRequest(BaseModel):
    """Common impeller-outlet parameters for all volute endpoints."""

    d2: float = Field(..., gt=0, description="Impeller outlet diameter [m]")
    b2: float = Field(..., gt=0, description="Impeller outlet width [m]")
    flow_rate: float = Field(..., gt=0, description="Design flow rate Q [m^3/s]")
    cu2: float = Field(..., gt=0, description="Tangential velocity at outlet [m/s]")
    radial_gap_ratio: float = Field(0.05, ge=0, le=0.3)
    cross_section: str = Field("circular", description="circular | trapezoidal | rectangular")
    n_stations: int = Field(36, ge=8, le=360)


class DoubleVoluteRequest(VoluteBaseRequest):
    splitter_angle_deg: float = Field(180.0, ge=90, le=270)
    splitter_thickness: float = Field(0.005, gt=0)
    merge_area_ratio: float = Field(1.1, ge=1.0, le=2.0)


class RectangularVoluteRequest(VoluteBaseRequest):
    aspect_ratio: float = Field(1.5, gt=0.2, le=5.0)
    aspect_ratio_tongue: float = Field(2.0, gt=0.2, le=5.0)
    corner_radius: float = Field(0.005, ge=0)
    area_law: str = Field("linear", description="'linear' or 'angular_momentum'")


class AxialEntryVoluteRequest(VoluteBaseRequest):
    axial_inlet_length: float = Field(0.0, ge=0, description="0 = auto-compute")
    axial_inlet_diameter: float = Field(0.0, ge=0, description="0 = auto-compute")
    blend_fraction: float = Field(0.3, ge=0.05, le=0.8)


class VoluteShellRequest(VoluteBaseRequest):
    thickness_uniform: float = Field(0.008, gt=0)
    thickness_tongue: Optional[float] = Field(None, gt=0)
    thickness_discharge: Optional[float] = Field(None, gt=0)


class SectionsRequest(VoluteBaseRequest):
    """Request cross-section export for a standard single volute."""
    pass


# --- Responses ---

class PassageResponse(BaseModel):
    theta_deg: List[float]
    areas: List[float]
    radii_outer: List[float]
    widths: List[float]
    hub_rz: List[List[float]]
    shroud_rz: List[List[float]]


class DoubleVoluteResponse(BaseModel):
    passage_a: PassageResponse
    passage_b: PassageResponse
    splitter_rz: List[List[float]]
    splitter_r_inner: float
    splitter_r_outer: float
    radial_force_ratio: float
    merge_outlet_area: float
    total_discharge_area: float


class RectStationResponse(BaseModel):
    theta_deg: float
    area: float
    width: float
    height: float
    r_outer: float


class RectangularVoluteResponse(BaseModel):
    stations: List[RectStationResponse]
    r3: float
    discharge_area: float
    discharge_width: float
    discharge_height: float
    corner_radius: float


class AxialEntryResponse(BaseModel):
    theta_deg: List[float]
    areas: List[float]
    radii_outer: List[float]
    axial_inlet_length: float
    axial_inlet_diameter: float
    axial_inlet_area: float
    blend_start_theta: float
    blend_end_theta: float
    blend_rz: List[List[float]]
    r3: float
    discharge_area: float


class ShellResponse(BaseModel):
    theta_stations: List[float]
    thickness_distribution: List[float]
    n_circumferential: int
    n_profile: int


class SectionDataResponse(BaseModel):
    theta_deg: List[float]
    areas: List[float]
    radii: List[float]
    widths: List[float]
    r3: float
    discharge_area: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_volute_params(req: VoluteBaseRequest) -> VoluteParams:
    """Convert a Pydantic request into VoluteParams dataclass."""
    cs_map = {
        "circular": CrossSectionType.CIRCULAR,
        "trapezoidal": CrossSectionType.TRAPEZOIDAL,
        "rectangular": CrossSectionType.RECTANGULAR,
    }
    return VoluteParams(
        d2=req.d2,
        b2=req.b2,
        flow_rate=req.flow_rate,
        cu2=req.cu2,
        radial_gap_ratio=req.radial_gap_ratio,
        cross_section=cs_map.get(req.cross_section, CrossSectionType.CIRCULAR),
        n_stations=req.n_stations,
    )


def _ndarray_to_list(arr: np.ndarray) -> List[List[float]]:
    """Convert 2-D ndarray to list-of-lists for JSON serialization."""
    return arr.tolist()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/double", response_model=DoubleVoluteResponse)
def design_double_volute(req: DoubleVoluteRequest) -> DoubleVoluteResponse:
    """Design a double (twin-entry) volute with 180-degree split."""
    try:
        base = _make_volute_params(req)
        cfg = DoubleVoluteConfig(
            base=base,
            splitter_angle_deg=req.splitter_angle_deg,
            splitter_thickness=req.splitter_thickness,
            merge_area_ratio=req.merge_area_ratio,
            n_stations_per_passage=max(8, req.n_stations // 2),
        )
        result = DoubleVolute(cfg).generate()

        def _passage(p):  # type: ignore[no-untyped-def]
            return PassageResponse(
                theta_deg=p.theta_deg.tolist(),
                areas=p.areas.tolist(),
                radii_outer=p.radii_outer.tolist(),
                widths=p.widths.tolist(),
                hub_rz=_ndarray_to_list(p.hub_rz),
                shroud_rz=_ndarray_to_list(p.shroud_rz),
            )

        return DoubleVoluteResponse(
            passage_a=_passage(result.passage_a),
            passage_b=_passage(result.passage_b),
            splitter_rz=_ndarray_to_list(result.splitter_rz),
            splitter_r_inner=result.splitter_r_inner,
            splitter_r_outer=result.splitter_r_outer,
            radial_force_ratio=result.radial_force_ratio,
            merge_outlet_area=result.merge_outlet_area,
            total_discharge_area=result.total_discharge_area,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/rectangular", response_model=RectangularVoluteResponse)
def design_rectangular_volute(req: RectangularVoluteRequest) -> RectangularVoluteResponse:
    """Design a rectangular cross-section volute for fan applications."""
    try:
        base = _make_volute_params(req)
        cfg = RectangularVoluteConfig(
            base=base,
            aspect_ratio=req.aspect_ratio,
            aspect_ratio_tongue=req.aspect_ratio_tongue,
            corner_radius=req.corner_radius,
            area_law=req.area_law,
            n_stations=req.n_stations,
        )
        result = RectangularVolute(cfg).generate()

        stations = [
            RectStationResponse(
                theta_deg=s.theta_deg,
                area=s.area,
                width=s.width,
                height=s.height,
                r_outer=s.r_outer,
            )
            for s in result.stations
        ]

        return RectangularVoluteResponse(
            stations=stations,
            r3=result.r3,
            discharge_area=result.discharge_area,
            discharge_width=result.discharge_width,
            discharge_height=result.discharge_height,
            corner_radius=result.corner_radius,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/axial_entry", response_model=AxialEntryResponse)
def design_axial_entry_volute(req: AxialEntryVoluteRequest) -> AxialEntryResponse:
    """Design an axial-entry volute for compressor applications."""
    try:
        base = _make_volute_params(req)
        cfg = AxialEntryVoluteConfig(
            base=base,
            axial_inlet_length=req.axial_inlet_length,
            axial_inlet_diameter=req.axial_inlet_diameter,
            blend_fraction=req.blend_fraction,
            n_stations=req.n_stations,
        )
        result = AxialEntryVolute(cfg).generate()

        return AxialEntryResponse(
            theta_deg=result.theta_deg.tolist(),
            areas=result.areas.tolist(),
            radii_outer=result.radii_outer.tolist(),
            axial_inlet_length=result.axial_inlet_length,
            axial_inlet_diameter=result.axial_inlet_diameter,
            axial_inlet_area=result.axial_inlet_area,
            blend_start_theta=result.blend_start_theta,
            blend_end_theta=result.blend_end_theta,
            blend_rz=_ndarray_to_list(result.blend_rz),
            r3=result.r3,
            discharge_area=result.discharge_area,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/shell", response_model=ShellResponse)
def generate_volute_shell(req: VoluteShellRequest) -> ShellResponse:
    """Add wall thickness to a standard single volute."""
    try:
        base = _make_volute_params(req)
        sizing = size_volute(base)

        shell_cfg = VoluteShellConfig(
            thickness_uniform=req.thickness_uniform,
            thickness_tongue=req.thickness_tongue,
            thickness_discharge=req.thickness_discharge,
            n_circumferential=len(sizing.areas),
            n_profile=20,
        )
        result = VoluteShell(shell_cfg).generate(
            r3=sizing.r3,
            areas=np.array(sizing.areas),
            b2=base.b2,
            theta_stations_deg=np.array(sizing.theta_stations),
        )

        return ShellResponse(
            theta_stations=result.theta_stations.tolist(),
            thickness_distribution=result.thickness_distribution.tolist(),
            n_circumferential=result.inner_surface.shape[0],
            n_profile=result.inner_surface.shape[1],
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sections", response_model=SectionDataResponse)
def export_volute_sections(req: SectionsRequest) -> SectionDataResponse:
    """Export cross-section data at each angular station for a single volute."""
    try:
        base = _make_volute_params(req)
        sizing = size_volute(base)

        return SectionDataResponse(
            theta_deg=sizing.theta_stations,
            areas=sizing.areas,
            radii=sizing.radii,
            widths=sizing.widths,
            r3=sizing.r3,
            discharge_area=sizing.discharge_area,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
