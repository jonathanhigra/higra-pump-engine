"""API routes for CFD design loop.

Provides endpoints to set up, run, and retrieve results from
automated CFD design iterations.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/cfd", tags=["cfd"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CFDSetupRequest(BaseModel):
    """Request body for POST /cfd/setup."""

    flow_rate: float = Field(..., gt=0, description="Flow rate [m3/s]")
    head: float = Field(..., gt=0, description="Design head [m]")
    rpm: float = Field(..., gt=0, description="Rotational speed [rpm]")
    target_head: Optional[float] = Field(None, description="Head target for comparison [m]")
    target_efficiency: Optional[float] = Field(None, description="Efficiency target [-]")
    n_procs: int = Field(4, ge=1, description="Number of parallel processors")
    timeout: Optional[int] = Field(None, description="Solver timeout [s]")
    machine_type: str = Field("centrifugal_pump", description="Machine type")


class CFDRunRequest(BaseModel):
    """Request body for POST /cfd/run."""

    run_id: str = Field(..., description="Run ID from /cfd/setup")


class CFDDesignLoopRequest(BaseModel):
    """Request body for POST /cfd/design_loop."""

    flow_rate: float = Field(..., gt=0)
    head: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    target_head: Optional[float] = None
    target_efficiency: Optional[float] = None
    max_iterations: int = Field(5, ge=1, le=20)
    head_tolerance: float = Field(0.02, gt=0)
    eta_tolerance: float = Field(0.01, gt=0)
    n_procs: int = Field(4, ge=1)
    timeout: Optional[int] = None


class CFDResultsResponse(BaseModel):
    """Response schema for CFD results."""

    head: float
    efficiency: float
    power: float
    pressure_rise: float
    total_pressure_loss: float
    mass_flow_check: float
    blade_loading: list[dict[str, Any]]
    convergence_residuals: list[float]


class DesignLoopResponse(BaseModel):
    """Response schema for the full design loop."""

    run_id: str
    converged: bool
    n_iterations: int
    final_head: float
    final_efficiency: float
    final_power: float
    history: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# In-memory store for runs (production would use DB)
# ---------------------------------------------------------------------------

_runs: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/setup")
def cfd_setup(req: CFDSetupRequest) -> dict[str, Any]:
    """Prepare a CFD case from sizing parameters.

    Runs meanline sizing, builds the OpenFOAM case directory, and
    returns a ``run_id`` for subsequent operations.
    """
    from hpe.core.enums import MachineType
    from hpe.core.models import OperatingPoint
    from hpe.sizing import run_sizing
    from hpe.cfd.design_loop import CFDDesignLoop

    op = OperatingPoint(
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        machine_type=MachineType(req.machine_type),
    )
    sizing = run_sizing(op)

    run_id = uuid.uuid4().hex[:12]
    work_dir = Path("cfd_runs") / run_id

    loop = CFDDesignLoop(work_dir=work_dir)
    loop.setup(
        sizing_result=sizing,
        solver_params={"n_procs": req.n_procs, "timeout": req.timeout},
        target_head=req.target_head,
        target_efficiency=req.target_efficiency,
    )

    _runs[run_id] = {
        "loop": loop,
        "sizing": sizing,
        "status": "ready",
        "results": None,
    }

    return {
        "run_id": run_id,
        "status": "ready",
        "case_dir": str(work_dir),
        "target_head": loop._target_head,
        "target_efficiency": loop._target_efficiency,
    }


@router.post("/run")
def cfd_run(req: CFDRunRequest) -> dict[str, Any]:
    """Execute a single CFD run for a previously set-up case.

    Returns extracted results.
    """
    if req.run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {req.run_id} not found.")

    entry = _runs[req.run_id]
    loop: Any = entry["loop"]
    sizing = entry["sizing"]

    case_dir = loop.work_dir / "single_run"

    from hpe.cfd.openfoam.case_builder import build_case
    build_case(
        sizing=sizing,
        step_file=case_dir / "placeholder.step",
        output_dir=case_dir,
        n_procs=loop._solver_params.get("n_procs", 4),
    )

    try:
        run_results = loop.run_single(case_dir)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if not all(r.success for r in run_results):
        failed = [r for r in run_results if not r.success]
        raise HTTPException(
            status_code=500,
            detail={
                "message": "CFD run failed",
                "failed_steps": [
                    {"command": r.command, "stderr": r.stderr[:500]}
                    for r in failed
                ],
            },
        )

    cfd_results = loop.extract_results(case_dir)
    entry["results"] = cfd_results
    entry["status"] = "completed"

    return {
        "run_id": req.run_id,
        "status": "completed",
        "results": {
            "head": round(cfd_results.head, 4),
            "efficiency": round(cfd_results.efficiency, 4),
            "power": round(cfd_results.power, 2),
            "pressure_rise": round(cfd_results.pressure_rise, 2),
            "total_pressure_loss": round(cfd_results.total_pressure_loss, 2),
            "mass_flow_check": cfd_results.mass_flow_check,
            "n_blade_loading_spans": len(cfd_results.blade_loading),
            "n_residual_points": len(cfd_results.convergence_residuals),
        },
    }


@router.post("/design_loop")
def cfd_design_loop(req: CFDDesignLoopRequest) -> DesignLoopResponse:
    """Run the full automated CFD design loop.

    Iterates sizing -> CFD -> compare -> adjust until convergence.
    """
    from hpe.core.enums import MachineType
    from hpe.core.models import OperatingPoint
    from hpe.sizing import run_sizing
    from hpe.cfd.design_loop import CFDDesignLoop

    op = OperatingPoint(
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        machine_type=MachineType("centrifugal_pump"),
    )
    sizing = run_sizing(op)

    run_id = uuid.uuid4().hex[:12]
    work_dir = Path("cfd_runs") / run_id

    loop = CFDDesignLoop(work_dir=work_dir)
    loop.setup(
        sizing_result=sizing,
        solver_params={"n_procs": req.n_procs, "timeout": req.timeout},
        target_head=req.target_head,
        target_efficiency=req.target_efficiency,
    )

    try:
        result = loop.run_design_loop(
            max_iterations=req.max_iterations,
            head_tolerance=req.head_tolerance,
            eta_tolerance=req.eta_tolerance,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    history_out = [
        {
            "iteration": h.iteration,
            "head_target": round(h.head_target, 4),
            "head_cfd": round(h.head_cfd, 4),
            "eta_target": round(h.eta_target, 4),
            "eta_cfd": round(h.eta_cfd, 4),
            "geometry_changes": h.geometry_changes,
        }
        for h in result.history
    ]

    return DesignLoopResponse(
        run_id=result.run_id,
        converged=result.converged,
        n_iterations=result.n_iterations,
        final_head=round(result.final_results.head, 4),
        final_efficiency=round(result.final_results.efficiency, 4),
        final_power=round(result.final_results.power, 2),
        history=history_out,
    )


@router.get("/results/{run_id}")
def get_cfd_results(run_id: str) -> dict[str, Any]:
    """Retrieve results from a previously executed CFD run."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")

    entry = _runs[run_id]
    if entry["results"] is None:
        return {"run_id": run_id, "status": entry["status"], "results": None}

    r = entry["results"]
    return {
        "run_id": run_id,
        "status": entry["status"],
        "results": {
            "head": round(r.head, 4),
            "efficiency": round(r.efficiency, 4),
            "power": round(r.power, 2),
            "pressure_rise": round(r.pressure_rise, 2),
            "total_pressure_loss": round(r.total_pressure_loss, 2),
            "mass_flow_check": r.mass_flow_check,
            "blade_loading": r.blade_loading,
            "convergence_residuals": r.convergence_residuals,
        },
    }
