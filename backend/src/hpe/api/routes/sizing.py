"""Sizing API routes."""

from __future__ import annotations

from fastapi import APIRouter

from hpe.api.schemas.sizing import (
    CurvePoint,
    CurvesRequest,
    CurvesResponse,
    OptimizeRequest,
    OptimizeResponse,
    SizingRequest,
    SizingResponse,
)
from hpe.core.enums import MachineType
from hpe.core.models import OperatingPoint

router = APIRouter(prefix="/api/v1", tags=["sizing"])


@router.post("/sizing", response_model=SizingResponse)
def run_sizing_endpoint(req: SizingRequest) -> SizingResponse:
    """Run 1D meanline sizing."""
    from hpe.sizing import run_sizing

    op = OperatingPoint(
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        machine_type=MachineType(req.machine_type),
    )
    result = run_sizing(op)

    return SizingResponse(
        specific_speed_nq=result.specific_speed_nq,
        impeller_type=result.meridional_profile.get("impeller_type", "unknown"),
        impeller_d2=result.impeller_d2,
        impeller_d1=result.impeller_d1,
        impeller_b2=result.impeller_b2,
        blade_count=result.blade_count,
        beta1=result.beta1,
        beta2=result.beta2,
        estimated_efficiency=result.estimated_efficiency,
        estimated_power=result.estimated_power,
        estimated_npsh_r=result.estimated_npsh_r,
        sigma=result.sigma,
        velocity_triangles=result.velocity_triangles,
        meridional_profile=result.meridional_profile,
        warnings=result.warnings,
    )


@router.post("/curves", response_model=CurvesResponse)
def generate_curves_endpoint(req: CurvesRequest) -> CurvesResponse:
    """Generate performance curves."""
    from hpe.physics.curves import generate_curves
    from hpe.physics.stability import find_bep
    from hpe.sizing import run_sizing

    op = OperatingPoint(flow_rate=req.flow_rate, head=req.head, rpm=req.rpm)
    sizing = run_sizing(op)
    curves = generate_curves(
        sizing,
        q_min_ratio=req.q_min_ratio,
        q_max_ratio=req.q_max_ratio,
        n_points=req.n_points,
    )

    points = [
        CurvePoint(
            flow_rate=curves.flow_rates[i],
            head=curves.heads[i],
            efficiency=curves.efficiencies[i],
            power=curves.powers[i],
            npsh_required=curves.npsh_required[i],
        )
        for i in range(len(curves.flow_rates))
    ]

    q_bep, h_bep, eta_bep = find_bep(curves)

    return CurvesResponse(
        points=points,
        bep_flow=q_bep,
        bep_head=h_bep,
        bep_efficiency=eta_bep,
    )


@router.post("/optimize", response_model=OptimizeResponse)
def optimize_endpoint(req: OptimizeRequest) -> OptimizeResponse:
    """Run multi-objective optimization."""
    from hpe.optimization import run_optimization
    from hpe.optimization.problem import OptimizationProblem

    problem = OptimizationProblem.default(req.flow_rate, req.head, req.rpm)

    if req.method == "nsga2":
        result = run_optimization(
            problem, method="nsga2",
            pop_size=req.pop_size, n_gen=req.n_gen, seed=req.seed,
        )
        return OptimizeResponse(
            pareto_front=result.pareto_front,
            n_evaluations=result.all_evaluations,
            best_efficiency=result.best_efficiency,
            best_npsh=result.best_npsh,
        )
    else:
        from hpe.optimization.bayesian import run_bayesian
        result = run_bayesian(problem, n_trials=req.n_gen, seed=req.seed)
        return OptimizeResponse(
            pareto_front=[{"variables": result["best_params"], "objectives": {"efficiency": result["best_value"]}}],
            n_evaluations=result["n_trials"],
        )
