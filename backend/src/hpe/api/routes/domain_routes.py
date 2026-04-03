"""Domain extent / flaring control API routes.

Endpoints:
    POST /api/v1/cfd/domain   — generate extended computational domain
    GET  /api/v1/cfd/domain/presets — list available presets
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["cfd"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class DomainRequest(BaseModel):
    """Input for domain generation."""

    hub_rz: List[List[float]] = Field(
        ..., description="Hub meridional contour as [[r, z], ...] [m]"
    )
    shroud_rz: List[List[float]] = Field(
        ..., description="Shroud meridional contour as [[r, z], ...] [m]"
    )
    d1: float = Field(..., gt=0, description="Inlet diameter [m]")
    d2: float = Field(..., gt=0, description="Outlet diameter [m]")

    # Domain extent parameters (all optional — defaults used)
    inlet_extension: float = Field(3.0, ge=0, description="Inlet extension as multiples of D1")
    outlet_extension: float = Field(5.0, ge=0, description="Outlet extension as multiples of D2")
    inlet_hub_ratio: float = Field(1.0, gt=0, description="Hub flaring ratio at inlet")
    inlet_shroud_ratio: float = Field(1.0, gt=0, description="Shroud flaring ratio at inlet")
    outlet_hub_ratio: float = Field(1.0, gt=0, description="Hub flaring ratio at outlet")
    outlet_shroud_ratio: float = Field(1.0, gt=0, description="Shroud flaring ratio at outlet")
    flaring_type: str = Field("linear", description="Flaring shape: linear, parabolic, exponential")
    preset: Optional[str] = Field(None, description="Use a named preset instead of individual parameters")
    validate_result: bool = Field(True, description="Run domain quality validation")
    multi_grid_levels: Optional[int] = Field(None, ge=1, le=5, description="Generate multi-grid levels")


class DomainResponse(BaseModel):
    """Output of domain generation."""

    domain: Dict[str, Any]
    validation: Optional[Dict[str, Any]] = None
    multi_grid: Optional[List[Dict[str, Any]]] = None


class PresetInfo(BaseModel):
    name: str
    inlet_extension: float
    outlet_extension: float
    inlet_hub_ratio: float
    inlet_shroud_ratio: float
    outlet_hub_ratio: float
    outlet_shroud_ratio: float
    flaring_type: str


class PresetsResponse(BaseModel):
    presets: List[PresetInfo]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/cfd/domain", response_model=DomainResponse)
def generate_domain(req: DomainRequest) -> DomainResponse:
    """Generate extended computational domain around the impeller."""
    import numpy as np
    from hpe.cfd.domain_extent import DomainExtent, PRESETS

    if req.preset:
        if req.preset not in PRESETS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown preset '{req.preset}'. Available: {list(PRESETS.keys())}",
            )
        de = PRESETS[req.preset]
    else:
        if req.flaring_type not in ("linear", "parabolic", "exponential"):
            raise HTTPException(status_code=400, detail=f"Invalid flaring_type: {req.flaring_type}")
        de = DomainExtent(
            inlet_extension=req.inlet_extension,
            outlet_extension=req.outlet_extension,
            inlet_hub_ratio=req.inlet_hub_ratio,
            inlet_shroud_ratio=req.inlet_shroud_ratio,
            outlet_hub_ratio=req.outlet_hub_ratio,
            outlet_shroud_ratio=req.outlet_shroud_ratio,
            flaring_type=req.flaring_type,  # type: ignore[arg-type]
        )

    try:
        hub = np.array(req.hub_rz, dtype=np.float64)
        shroud = np.array(req.shroud_rz, dtype=np.float64)
        if hub.ndim != 2 or hub.shape[1] != 2:
            raise ValueError("hub_rz must be Nx2 array")
        if shroud.ndim != 2 or shroud.shape[1] != 2:
            raise ValueError("shroud_rz must be Nx2 array")
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    domain = de.generate_domain(hub, shroud, req.d1, req.d2)

    validation = None
    if req.validate_result:
        validation = de.validate_domain(domain)

    multi_grid = None
    if req.multi_grid_levels:
        grids = de.generate_multi_grid(domain, levels=req.multi_grid_levels)
        multi_grid = [g.as_dict() for g in grids]

    return DomainResponse(
        domain=domain.as_dict(),
        validation=validation,
        multi_grid=multi_grid,
    )


@router.get("/cfd/domain/presets", response_model=PresetsResponse)
def list_presets() -> PresetsResponse:
    """List available domain extent presets."""
    from hpe.cfd.domain_extent import PRESETS

    items = []
    for name, de in PRESETS.items():
        items.append(PresetInfo(
            name=name,
            inlet_extension=de.inlet_extension,
            outlet_extension=de.outlet_extension,
            inlet_hub_ratio=de.inlet_hub_ratio,
            inlet_shroud_ratio=de.inlet_shroud_ratio,
            outlet_hub_ratio=de.outlet_hub_ratio,
            outlet_shroud_ratio=de.outlet_shroud_ratio,
            flaring_type=de.flaring_type,
        ))
    return PresetsResponse(presets=items)
