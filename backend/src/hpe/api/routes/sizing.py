"""Sizing API routes — with sensitivity, operating_range and validation (#22, #23, #24)."""

from __future__ import annotations
import asyncio
from fastapi import APIRouter, HTTPException
from hpe.api.schemas.sizing import (
    CurvePoint, CurvesRequest, CurvesResponse,
    MultiPointRequest, MultiPointResponse,
    OptimizeRequest, OptimizeResponse,
    SizingRequest, SizingResponse,
)
from hpe.core.enums import MachineType
from hpe.core.models import OperatingPoint
from hpe.sizing.validator import PhysicsValidator

router = APIRouter(prefix="/api/v1", tags=["sizing"])


def _validate_op(flow_rate: float, head: float, rpm: float) -> None:
    """Raise 422 if parameters are physically invalid (#24)."""
    vr = PhysicsValidator.validate(flow_rate, head, rpm)
    if not vr.valid:
        raise HTTPException(status_code=422, detail={"errors": vr.errors})


@router.post("/sizing", response_model=SizingResponse)
def run_sizing_endpoint(req: SizingRequest) -> SizingResponse:
    """Run 1D meanline sizing with physical validation (#24)."""
    from hpe.sizing import run_sizing
    _validate_op(req.flow_rate, req.head, req.rpm)

    op = OperatingPoint(
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        machine_type=MachineType(req.machine_type),
        override_d2=req.override_d2,
        override_b2=req.override_b2,
        override_d1=req.override_d1,
    )
    result = run_sizing(op)

    uncertainty = result.uncertainty.as_dict() if result.uncertainty else {}

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
        uncertainty=uncertainty,
    )


@router.post("/sizing/multi_point", response_model=MultiPointResponse)
async def run_multi_point_endpoint(req: MultiPointRequest) -> MultiPointResponse:
    """Run 1D sizing concurrently for multiple operating points (A2).

    Each entry in `req.points` must contain flow_rate, head, rpm.
    Optional per-point keys: machine_type, override_d2, override_b2, override_d1.
    Results are returned in the same order as the input points.
    """
    from hpe.sizing import run_sizing

    def _size_one(point: dict) -> dict:
        flow_rate = float(point["flow_rate"])
        head = float(point["head"])
        rpm = float(point["rpm"])
        machine_type_str = point.get("machine_type", "centrifugal_pump")
        _validate_op(flow_rate, head, rpm)
        op = OperatingPoint(
            flow_rate=flow_rate,
            head=head,
            rpm=rpm,
            machine_type=MachineType(machine_type_str),
            override_d2=point.get("override_d2"),
            override_b2=point.get("override_b2"),
            override_d1=point.get("override_d1"),
        )
        result = run_sizing(op)
        uncertainty = result.uncertainty.as_dict() if result.uncertainty else {}
        return {
            # Echo back input
            "flow_rate": flow_rate,
            "head": head,
            "rpm": rpm,
            "machine_type": machine_type_str,
            # Sizing outputs
            "specific_speed_nq": result.specific_speed_nq,
            "impeller_type": result.meridional_profile.get("impeller_type", "unknown"),
            "impeller_d2": result.impeller_d2,
            "impeller_d1": result.impeller_d1,
            "impeller_b2": result.impeller_b2,
            "blade_count": result.blade_count,
            "beta1": result.beta1,
            "beta2": result.beta2,
            "estimated_efficiency": result.estimated_efficiency,
            "estimated_power": result.estimated_power,
            "estimated_npsh_r": result.estimated_npsh_r,
            "sigma": result.sigma,
            "convergence_iterations": result.convergence_iterations,
            "warnings": result.warnings,
            "uncertainty": uncertainty,
        }

    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(None, _size_one, point)
        for point in req.points
    ]
    results = await asyncio.gather(*tasks)

    return MultiPointResponse(results=list(results))


@router.post("/curves", response_model=CurvesResponse)
def generate_curves_endpoint(req: CurvesRequest) -> CurvesResponse:
    """Generate performance curves with instability detection (#4)."""
    from hpe.physics.curves import generate_curves
    from hpe.physics.stability import find_bep
    from hpe.sizing import run_sizing
    _validate_op(req.flow_rate, req.head, req.rpm)

    op = OperatingPoint(flow_rate=req.flow_rate, head=req.head, rpm=req.rpm)
    sizing = run_sizing(op)
    curves = generate_curves(sizing, q_min_ratio=req.q_min_ratio,
                              q_max_ratio=req.q_max_ratio, n_points=req.n_points)

    points = [
        CurvePoint(
            flow_rate=curves.flow_rates[i],
            head=curves.heads[i],
            efficiency=curves.efficiencies[i],
            power=curves.powers[i],
            npsh_required=curves.npsh_required[i],
            is_unstable=curves.is_unstable[i] if i < len(curves.is_unstable) else False,
        )
        for i in range(len(curves.flow_rates))
    ]

    q_bep, h_bep, eta_bep = find_bep(curves)

    return CurvesResponse(
        points=points,
        bep_flow=q_bep,
        bep_head=h_bep,
        bep_efficiency=eta_bep,
        unstable_q_min=curves.unstable_q_range[0] if curves.unstable_q_range else None,
        unstable_q_max=curves.unstable_q_range[1] if curves.unstable_q_range else None,
    )


@router.get("/sizing/sensitivity")
def sizing_sensitivity(flow_rate: float, head: float, rpm: float) -> dict:
    """Return ∂D2/∂Q, ∂eta/∂RPM, ∂NPSHr/∂Q at the given operating point (#22).

    Uses finite differences with ±1% perturbation.
    """
    from hpe.sizing import run_sizing
    _validate_op(flow_rate, head, rpm)

    op0 = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    r0 = run_sizing(op0)

    eps_q = flow_rate * 0.01
    eps_h = head * 0.01
    eps_n = rpm * 0.01

    def dq(fn):
        rp = run_sizing(OperatingPoint(flow_rate=flow_rate + eps_q, head=head, rpm=rpm))
        return (fn(rp) - fn(r0)) / eps_q

    def dh(fn):
        rp = run_sizing(OperatingPoint(flow_rate=flow_rate, head=head + eps_h, rpm=rpm))
        return (fn(rp) - fn(r0)) / eps_h

    def dn(fn):
        rp = run_sizing(OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm + eps_n))
        return (fn(rp) - fn(r0)) / eps_n

    return {
        "design_point": {
            "d2_mm": r0.impeller_d2 * 1000,
            "eta_pct": r0.estimated_efficiency * 100,
            "npsh_r_m": r0.estimated_npsh_r,
            "nq": r0.specific_speed_nq,
        },
        "dD2_dQ": dq(lambda r: r.impeller_d2 * 1000),         # mm / (m³/s)
        "dEta_dQ": dq(lambda r: r.estimated_efficiency * 100),  # % / (m³/s)
        "dNPSH_dQ": dq(lambda r: r.estimated_npsh_r),           # m / (m³/s)
        "dD2_dH": dh(lambda r: r.impeller_d2 * 1000),           # mm / m
        "dD2_dN": dn(lambda r: r.impeller_d2 * 1000),           # mm / rpm
        "dEta_dN": dn(lambda r: r.estimated_efficiency * 100),  # % / rpm
    }


@router.get("/sizing/operating_range")
def sizing_operating_range(flow_rate: float, head: float, rpm: float) -> dict:
    """Return Q_min, Q_BEP, Q_max, H_shutoff, H_runout (#23)."""
    from hpe.physics.curves import generate_curves
    from hpe.physics.stability import find_bep
    from hpe.sizing import run_sizing
    _validate_op(flow_rate, head, rpm)

    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    sizing = run_sizing(op)
    curves = generate_curves(sizing, q_min_ratio=0.05, q_max_ratio=1.6, n_points=40)

    q_bep, h_bep, eta_bep = find_bep(curves)

    # Q_min: 50% of BEP (Gulich §4.2 minimum stable flow)
    q_min = q_bep * 0.50
    # Q_max: last point with positive head
    q_max = curves.flow_rates[-1]
    for i in range(len(curves.heads) - 1, -1, -1):
        if curves.heads[i] > 0.1 * curves.heads[0]:
            q_max = curves.flow_rates[i]
            break

    # Shutoff head: extrapolate to Q=0 (index 0, lowest flow)
    h_shutoff = curves.heads[0]
    # Runout head: head at max flow
    h_runout = curves.heads[-1]

    return {
        "q_min_m3s": q_min,
        "q_bep_m3s": q_bep,
        "q_max_m3s": q_max,
        "h_shutoff_m": h_shutoff,
        "h_bep_m": h_bep,
        "h_runout_m": h_runout,
        "eta_bep_pct": eta_bep * 100,
        "unstable_q_min": curves.unstable_q_range[0] if curves.unstable_q_range else None,
        "unstable_q_max": curves.unstable_q_range[1] if curves.unstable_q_range else None,
        "q_bep_m3h": q_bep * 3600,
        "q_min_m3h": q_min * 3600,
        "q_max_m3h": q_max * 3600,
    }


@router.get("/sizing/efficiency_map")
def sizing_efficiency_map(
    flow_rate: float,
    head: float,
    rpm: float,
    n_q: int = 14,
    n_h: int = 12,
    q_min_ratio: float = 0.30,
    q_max_ratio: float = 1.55,
    h_min_ratio: float = 0.30,
    h_max_ratio: float = 1.70,
) -> dict:
    """Return 2D efficiency map over (Q, H) space (#17).

    Each cell: { flow_m3h, head, efficiency, is_design, nq }.
    The frontend can render this as a colored island-curve (η-contour) chart.
    """
    import numpy as np
    from hpe.sizing import run_sizing

    _validate_op(flow_rate, head, rpm)

    q_vals = np.linspace(flow_rate * q_min_ratio, flow_rate * q_max_ratio, n_q)
    h_vals = np.linspace(head * h_min_ratio, head * h_max_ratio, n_h)

    # Design point snapped to nearest grid cell
    dq_m3h = round(flow_rate * 3600, 3)
    dh     = round(head, 3)

    points = []
    eta_values: list[float] = []

    for q_i in q_vals:
        for h_i in h_vals:
            try:
                r = run_sizing(OperatingPoint(flow_rate=float(q_i), head=float(h_i), rpm=rpm))
                eta = r.estimated_efficiency
                nq_val = round(r.specific_speed_nq, 2)
            except Exception:
                eta = 0.0
                nq_val = 0.0
            q_m3h = round(float(q_i) * 3600, 3)
            h_rnd = round(float(h_i), 3)
            is_design = (abs(q_m3h - dq_m3h) < (dq_m3h * 0.08)
                         and abs(h_rnd - dh) < (dh * 0.08))
            points.append({
                "flow_m3h": q_m3h,
                "head": h_rnd,
                "efficiency": round(eta, 4),
                "is_design": is_design,
                "nq": nq_val,
            })
            if eta > 0:
                eta_values.append(eta)

    eta_max = max(eta_values) if eta_values else 0.0
    eta_min = min(eta_values) if eta_values else 0.0

    return {
        "points": points,
        "design_q_m3h": dq_m3h,
        "design_head": dh,
        "n_q": n_q,
        "n_h": n_h,
        "eta_max": round(eta_max, 4),
        "eta_min": round(eta_min, 4),
    }


@router.get("/sizing/throat")
def sizing_throat(flow_rate: float, head: float, rpm: float) -> dict:
    """Return throat area and throat velocity at the impeller outlet (B5).

    Runs a full 1D sizing, then applies the Gülich throat area approximation.
    """
    from hpe.sizing import run_sizing
    from hpe.physics.throat import calc_throat_area, calc_throat_velocity
    _validate_op(flow_rate, head, rpm)

    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    result = run_sizing(op)

    throat_area = calc_throat_area(
        d2=result.impeller_d2,
        b2=result.impeller_b2,
        blade_count=result.blade_count,
        beta2=result.beta2,
    )
    throat_velocity = calc_throat_velocity(flow_rate, throat_area)

    return {
        "throat_area_m2": throat_area,
        "throat_velocity_m_s": throat_velocity,
        "d2_m": result.impeller_d2,
        "b2_m": result.impeller_b2,
        "blade_count": result.blade_count,
        "beta2_deg": result.beta2,
    }


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
