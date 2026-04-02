"""Extended optimization API routes.

Provides endpoints for:
    POST /api/v1/optimize/doe          — Optimal Latin Hypercube DoE
    POST /api/v1/optimize/rsm/fit      — Fit quadratic RSM to DoE results
    POST /api/v1/optimize/rsm/predict  — Predict with a fitted RSM
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hpe.optimization.doe import DoEConfig, DoEResult, generate_lhs
from hpe.optimization.rsm import RSMModel, fit_rsm, predict_rsm

router = APIRouter(prefix="/api/v1/optimize", tags=["optimization-ext"])


# ---------------------------------------------------------------------------
# DoE
# ---------------------------------------------------------------------------

class DoERequest(BaseModel):
    """Request body for DoE generation."""

    n_points: int = Field(45, ge=4, le=500, description="Number of design points")
    n_variables: int = Field(4, ge=1, le=20, description="Number of design variables")
    bounds: Optional[list[list[float]]] = Field(
        None,
        description="List of [lo, hi] pairs per variable. Defaults to [0, 1] for each.",
    )
    seed: int = Field(42, description="Random seed for reproducibility")
    optimize_iterations: int = Field(
        100, ge=0, le=2000, description="Swap iterations to improve space-filling"
    )


class DoEResponse(BaseModel):
    """Response body for DoE generation."""

    points: list[list[float]]
    min_distance: float
    coverage_metric: float
    n_points: int
    n_variables: int


@router.post("/doe", response_model=DoEResponse, summary="Generate Optimal Latin Hypercube design")
def generate_doe(req: DoERequest) -> DoEResponse:
    """Generate an Optimal Latin Hypercube design matrix.

    Returns a space-filling set of design points suitable for building
    surrogate models (RSM, kriging, neural nets) before expensive optimization.
    """
    bounds_tuples: Optional[list[tuple[float, float]]] = None
    if req.bounds is not None:
        if len(req.bounds) != req.n_variables:
            raise HTTPException(
                status_code=422,
                detail=f"bounds length ({len(req.bounds)}) must equal n_variables ({req.n_variables})",
            )
        for pair in req.bounds:
            if len(pair) != 2 or pair[0] >= pair[1]:
                raise HTTPException(
                    status_code=422,
                    detail=f"Each bound must be [lo, hi] with lo < hi, got {pair}",
                )
        bounds_tuples = [(b[0], b[1]) for b in req.bounds]

    config = DoEConfig(
        n_points=req.n_points,
        n_variables=req.n_variables,
        bounds=bounds_tuples,
        seed=req.seed,
        optimize_iterations=req.optimize_iterations,
    )

    result: DoEResult = generate_lhs(config)

    return DoEResponse(
        points=result.points,
        min_distance=result.min_distance,
        coverage_metric=result.coverage_metric,
        n_points=len(result.points),
        n_variables=req.n_variables,
    )


# ---------------------------------------------------------------------------
# RSM — in-memory model registry (keyed by model_id)
# ---------------------------------------------------------------------------

_rsm_registry: dict[str, RSMModel] = {}


class RSMFitRequest(BaseModel):
    """Request body for fitting an RSM."""

    model_id: str = Field(..., description="Unique identifier to store and retrieve this model")
    X: list[list[float]] = Field(..., description="Design matrix [n_points × n_variables]")
    y: list[float] = Field(..., description="Response values [n_points]")
    variable_names: Optional[list[str]] = Field(
        None, description="Names of design variables (cosmetic)"
    )


class RSMFitResponse(BaseModel):
    """Response body after fitting an RSM."""

    model_id: str
    n_variables: int
    n_coefficients: int
    r2_train: float
    variable_names: list[str]


@router.post("/rsm/fit", response_model=RSMFitResponse, summary="Fit quadratic RSM to DoE results")
def rsm_fit(req: RSMFitRequest) -> RSMFitResponse:
    """Fit a quadratic Response Surface Model to a set of DoE evaluations.

    The fitted model is stored in-memory under ``model_id`` and can be used
    for fast surrogate predictions via ``/rsm/predict``.
    """
    if not req.X:
        raise HTTPException(status_code=422, detail="X must not be empty")
    if len(req.X) != len(req.y):
        raise HTTPException(
            status_code=422,
            detail=f"X has {len(req.X)} rows but y has {len(req.y)} elements",
        )
    n_vars = len(req.X[0])
    if req.variable_names and len(req.variable_names) != n_vars:
        raise HTTPException(
            status_code=422,
            detail=f"variable_names length ({len(req.variable_names)}) != n_variables ({n_vars})",
        )
    if any(len(row) != n_vars for row in req.X):
        raise HTTPException(status_code=422, detail="All rows in X must have the same length")

    model = fit_rsm(req.X, req.y, req.variable_names)
    _rsm_registry[req.model_id] = model

    return RSMFitResponse(
        model_id=req.model_id,
        n_variables=model.n_variables,
        n_coefficients=len(model.coefficients),
        r2_train=model.r2_train,
        variable_names=model.variable_names,
    )


class RSMPredictRequest(BaseModel):
    """Request body for RSM prediction."""

    model_id: str = Field(..., description="Model ID returned by /rsm/fit")
    x: list[float] = Field(..., description="Design point [n_variables]")


class RSMPredictResponse(BaseModel):
    """Response body for RSM prediction."""

    model_id: str
    x: list[float]
    y_pred: float


@router.post(
    "/rsm/predict",
    response_model=RSMPredictResponse,
    summary="Predict response with a fitted RSM",
)
def rsm_predict(req: RSMPredictRequest) -> RSMPredictResponse:
    """Predict the response at a new design point using a previously fitted RSM.

    The model must have been fitted via ``/rsm/fit`` first.
    """
    model = _rsm_registry.get(req.model_id)
    if model is None:
        raise HTTPException(
            status_code=404,
            detail=f"Model '{req.model_id}' not found. Fit it first with /rsm/fit.",
        )
    if len(req.x) != model.n_variables:
        raise HTTPException(
            status_code=422,
            detail=f"x has {len(req.x)} values but model expects {model.n_variables}",
        )

    y_pred = predict_rsm(model, req.x)

    return RSMPredictResponse(model_id=req.model_id, x=req.x, y_pred=y_pred)
