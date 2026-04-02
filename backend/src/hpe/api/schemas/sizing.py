"""Pydantic schemas for sizing API endpoints."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SizingRequest(BaseModel):
    """Request body for sizing endpoint."""
    flow_rate: float = Field(..., gt=0, description="Volumetric flow rate Q [m³/s]")
    head: float = Field(..., gt=0, description="Total head H [m]")
    rpm: float = Field(..., gt=0, description="Rotational speed [rev/min]")
    machine_type: str = Field("centrifugal_pump", description="Machine type")
    fluid: str = Field("water", description="Working fluid")
    pre_swirl_angle: float = Field(0.0, description="Inlet pre-swirl angle [deg] (#7)")
    slip_model: str = Field("wiesner", description="Slip factor model: wiesner|stodola|busemann (#1)")
    # User geometry overrides (A5)
    override_d2: Optional[float] = Field(None, gt=0, description="Override outlet diameter D2 [m]")
    override_b2: Optional[float] = Field(None, gt=0, description="Override outlet width b2 [m]")
    override_d1: Optional[float] = Field(None, gt=0, description="Override inlet diameter D1 [m]")


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
    uncertainty: Dict[str, float] = Field(default_factory=dict)  # (#8)


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
    is_unstable: bool = False  # (#4)


class CurvesResponse(BaseModel):
    points: List[CurvePoint]
    bep_flow: float
    bep_head: float
    bep_efficiency: float
    unstable_q_min: Optional[float] = None  # (#4)
    unstable_q_max: Optional[float] = None  # (#4)


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


class MultiPointRequest(BaseModel):
    """Request body for multi-point sizing analysis (A2).

    Each entry in `points` must contain at minimum:
        flow_rate (m³/s), head (m), rpm (rev/min).
    Optional per-point keys: machine_type, override_d2, override_b2, override_d1.
    """
    points: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        description="List of operating points. Each dict must have flow_rate, head, rpm.",
    )


class MultiPointResponse(BaseModel):
    """Response body for multi-point sizing analysis (A2).

    Each entry mirrors the input point plus all sizing result fields.
    """
    results: List[Dict[str, Any]]
