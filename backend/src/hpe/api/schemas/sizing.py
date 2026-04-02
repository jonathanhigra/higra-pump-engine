"""Pydantic schemas for sizing API endpoints."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SizingRequest(BaseModel):
    """Request body for sizing endpoint."""

    flow_rate: float = Field(..., gt=0, description="Volumetric flow rate Q [m3/s]")
    head: float = Field(..., gt=0, description="Total head H [m]")
    rpm: float = Field(..., gt=0, description="Rotational speed [rev/min]")
    machine_type: str = Field("centrifugal_pump", description="Machine type")
    fluid: str = Field("water", description="Working fluid")


class SizingResponse(BaseModel):
    """Response body with sizing results."""

    specific_speed_nq: float
    impeller_type: str
    impeller_d2: float
    impeller_d1: float
    impeller_b2: float
    blade_count: int
    beta1: float
    beta2: float
    estimated_efficiency: float
    estimated_power: float
    estimated_npsh_r: float
    sigma: float
    velocity_triangles: Dict[str, Any]
    meridional_profile: Dict[str, Any]
    warnings: List[str]


class CurvesRequest(BaseModel):
    """Request body for performance curves."""

    flow_rate: float = Field(..., gt=0)
    head: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    n_points: int = Field(25, ge=5, le=100)
    q_min_ratio: float = Field(0.1, ge=0.0)
    q_max_ratio: float = Field(1.5, le=3.0)


class CurvePoint(BaseModel):
    flow_rate: float
    head: float
    efficiency: float
    power: float
    npsh_required: float


class CurvesResponse(BaseModel):
    points: List[CurvePoint]
    bep_flow: float
    bep_head: float
    bep_efficiency: float


class OptimizeRequest(BaseModel):
    """Request body for optimization."""

    flow_rate: float = Field(..., gt=0)
    head: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    method: str = Field("nsga2", description="nsga2 or bayesian")
    pop_size: int = Field(20, ge=10, le=200)
    n_gen: int = Field(20, ge=5, le=500)
    seed: int = Field(42)


class OptimizeResponse(BaseModel):
    pareto_front: List[Dict[str, Any]]
    n_evaluations: int
    best_efficiency: Optional[Dict[str, Any]] = None
    best_npsh: Optional[Dict[str, Any]] = None
