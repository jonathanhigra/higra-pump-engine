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

    # Apply blade count override if specified
    if req.override_z is not None:
        result.blade_count = req.override_z

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


@router.get("/sizing/reference_geometry")
def reference_geometry_endpoint(nq: float | None = None) -> dict:
    """Return reference pump geometry from the empirical literature database (A6).

    If `nq` is provided, returns the single best-matching entry for that
    specific speed (Nq metric).  Otherwise returns the full database.
    """
    from hpe.sizing.geometry_database import get_reference_geometry, get_all_references

    if nq is not None:
        ref = get_reference_geometry(nq)
        if ref is None:
            raise HTTPException(status_code=404, detail=f"No reference geometry found for Nq={nq}.")
        return {
            "source": ref.source,
            "nq_min": ref.nq_range[0],
            "nq_max": ref.nq_range[1],
            "d1_d2": ref.d1_d2,
            "b2_d2": ref.b2_d2,
            "beta2_deg": ref.beta2_deg,
            "blade_count": ref.blade_count,
            "psi": ref.psi,
            "eta_best": ref.eta_best,
            "notes": ref.notes,
        }
    return {"references": get_all_references()}


@router.post("/sizing/inducer")
def inducer_endpoint(
    flow_rate: float,
    rpm: float,
    npsh_available: float = 5.0,
    d_impeller: float = 0.0,
) -> dict:
    """Size an axial inducer for improved NPSH."""
    from hpe.sizing.inducer import size_inducer
    ind = size_inducer(
        flow_rate=flow_rate,
        rpm=rpm,
        npsh_available=npsh_available,
        d_impeller=d_impeller,
    )
    return {
        "d_tip_mm": round(ind.d_tip * 1000, 1),
        "d_hub_mm": round(ind.d_hub * 1000, 1),
        "hub_ratio": round(ind.hub_ratio, 3),
        "blade_count": ind.blade_count,
        "helix_angle_deg": round(ind.helix_angle, 1),
        "length_mm": round(ind.length * 1000, 1),
        "npsh_improvement_m": round(ind.npsh_improvement, 2),
        "sigma_i": round(ind.sigma_i, 4),
    }


@router.get("/sizing/multi_speed")
def sizing_multi_speed(
    flow_rate: float,
    head: float,
    rpm: float,
    speed_factors: str = "0.8,0.9,1.0,1.1,1.2",
) -> dict:
    """Affinity-law family of curves at multiple speeds (B11).

    Given a design point, scales Q, H, N by k, k², k respectively
    and computes full curves for each speed.
    Returns a list of speed-curve datasets for plotting.

    Args:
        flow_rate: Design flow rate [m³/s].
        head: Design head [m].
        rpm: Design speed [RPM].
        speed_factors: Comma-separated speed scaling factors (default 0.8,0.9,1.0,1.1,1.2).

    Returns:
        Dict with ``families`` list and ``n_speeds`` count.
    """
    from hpe.physics.curves import generate_curves
    from hpe.sizing import run_sizing

    _validate_op(flow_rate, head, rpm)

    factors = [float(f) for f in speed_factors.split(",") if f.strip()]
    op_base = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    sizing_base = run_sizing(op_base)

    families = []
    for k in factors:
        q_k = flow_rate * k
        h_k = head * k ** 2
        n_k = rpm * k
        try:
            op_k = OperatingPoint(flow_rate=q_k, head=h_k, rpm=n_k)
            s_k = run_sizing(op_k)
            curves_k = generate_curves(s_k, q_min_ratio=0.1, q_max_ratio=1.5, n_points=20)
            families.append({
                "speed_factor": round(k, 2),
                "rpm": round(n_k, 0),
                "points": [
                    {
                        "flow_m3h": round(curves_k.flow_rates[i] * 3600, 2),
                        "head": round(curves_k.heads[i], 2),
                        "efficiency": round(curves_k.efficiencies[i], 4),
                    }
                    for i in range(len(curves_k.flow_rates))
                ],
                "design_flow_m3h": round(q_k * 3600, 2),
                "design_head": round(h_k, 2),
            })
        except Exception:
            pass

    return {"families": families, "n_speeds": len(families)}


@router.get("/units/convert")
def units_convert(
    unit_type: str,
    value: float,
    from_unit: str,
    to_unit: str,
    rho: float = 998.0,
) -> dict:
    """Convert a value between unit systems (I5).

    Supported unit_type values and from/to_unit options:

    - flow_rate:  m3s, gpm, m3h, ft3s
    - head:       m, ft, psi
    - power:      w, kw, hp
    - diameter:   m, mm, in, ft
    - pressure:   pa, psi, bar, kpa

    Args:
        unit_type: Category of unit (flow_rate, head, power, diameter, pressure).
        value: Numeric value to convert.
        from_unit: Source unit string (e.g. "m3s", "gpm").
        to_unit: Target unit string (e.g. "gpm", "m3h").
        rho: Fluid density [kg/m³] — only used when converting head ↔ pressure (default: 998.0).

    Returns:
        Dict with input_value, input_unit, output_value, output_unit, unit_type.
    """
    from hpe.units import UnitConverter

    uc = UnitConverter
    fu = from_unit.lower().replace("/", "").replace("³", "3").replace("²", "2")
    tu = to_unit.lower().replace("/", "").replace("³", "3").replace("²", "2")

    # Normalise to SI first, then convert to target
    # ── Flow rate ──────────────────────────────────────────────────────────────
    if unit_type == "flow_rate":
        _to_si = {"m3s": 1.0, "gpm": 1.0/uc.GPM_PER_M3S, "m3h": 1.0/uc.M3H_PER_M3S, "ft3s": 1.0/uc.FT3S_PER_M3S}
        _from_si = {"m3s": 1.0, "gpm": uc.GPM_PER_M3S, "m3h": uc.M3H_PER_M3S, "ft3s": uc.FT3S_PER_M3S}
        if fu not in _to_si or tu not in _from_si:
            raise HTTPException(status_code=422, detail=f"Unknown flow_rate units: {from_unit} or {to_unit}. Valid: {list(_to_si)}")
        si_val = value * _to_si[fu]
        result = si_val * _from_si[tu]

    # ── Head ───────────────────────────────────────────────────────────────────
    elif unit_type == "head":
        if fu == "m":
            si_val = value
        elif fu == "ft":
            si_val = uc.ft_to_m(value)
        elif fu == "psi":
            si_val = uc.psi_to_m(value, rho=rho)
        else:
            raise HTTPException(status_code=422, detail=f"Unknown head unit: {from_unit}. Valid: m, ft, psi")
        if tu == "m":
            result = si_val
        elif tu == "ft":
            result = uc.m_to_ft(si_val)
        elif tu == "psi":
            result = uc.m_to_psi(si_val, rho=rho)
        else:
            raise HTTPException(status_code=422, detail=f"Unknown head unit: {to_unit}. Valid: m, ft, psi")

    # ── Power ──────────────────────────────────────────────────────────────────
    elif unit_type == "power":
        _to_si = {"w": 1.0, "kw": 1000.0, "hp": 1.0/uc.HP_PER_W}
        _from_si = {"w": 1.0, "kw": 1e-3, "hp": uc.HP_PER_W}
        if fu not in _to_si or tu not in _from_si:
            raise HTTPException(status_code=422, detail=f"Unknown power units: {from_unit} or {to_unit}. Valid: {list(_to_si)}")
        si_val = value * _to_si[fu]
        result = si_val * _from_si[tu]

    # ── Diameter / length ──────────────────────────────────────────────────────
    elif unit_type == "diameter":
        _to_si = {"m": 1.0, "mm": 1e-3, "in": 1.0/uc.IN_PER_M, "ft": 1.0/uc.FT_PER_M}
        _from_si = {"m": 1.0, "mm": 1e3, "in": uc.IN_PER_M, "ft": uc.FT_PER_M}
        if fu not in _to_si or tu not in _from_si:
            raise HTTPException(status_code=422, detail=f"Unknown diameter units: {from_unit} or {to_unit}. Valid: {list(_to_si)}")
        si_val = value * _to_si[fu]
        result = si_val * _from_si[tu]

    # ── Pressure ───────────────────────────────────────────────────────────────
    elif unit_type == "pressure":
        _to_si = {"pa": 1.0, "psi": 1.0/uc.PSI_PER_PA, "bar": 1.0/uc.BAR_PER_PA, "kpa": 1.0/uc.KPA_PER_PA}
        _from_si = {"pa": 1.0, "psi": uc.PSI_PER_PA, "bar": uc.BAR_PER_PA, "kpa": uc.KPA_PER_PA}
        if fu not in _to_si or tu not in _from_si:
            raise HTTPException(status_code=422, detail=f"Unknown pressure units: {from_unit} or {to_unit}. Valid: {list(_to_si)}")
        si_val = value * _to_si[fu]
        result = si_val * _from_si[tu]

    else:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown unit_type '{unit_type}'. Valid: flow_rate, head, power, diameter, pressure",
        )

    return {
        "unit_type": unit_type,
        "input_value": value,
        "input_unit": from_unit,
        "output_value": round(result, 8),
        "output_unit": to_unit,
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


# ---------------------------------------------------------------------------
# NP1 — Tip clearance loss
# ---------------------------------------------------------------------------

@router.post("/sizing/tip_clearance")
def tip_clearance_endpoint(
    flow_rate: float,
    head: float,
    rpm: float,
    tip_clearance_mm: float = 0.3,
) -> dict:
    """Calculate tip clearance loss for the sized impeller (NP1).

    Args:
        flow_rate: Q [m³/s].
        head: H [m].
        rpm: RPM.
        tip_clearance_mm: Radial tip gap s [mm] (default 0.3 mm).

    Returns:
        Tip clearance loss metrics plus the underlying sizing result.
    """
    from hpe.sizing import run_sizing
    from hpe.physics.tip_clearance import calc_tip_clearance_loss

    _validate_op(flow_rate, head, rpm)
    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    result = run_sizing(op)

    loss = calc_tip_clearance_loss(
        tip_clearance=tip_clearance_mm / 1000.0,
        b2=result.impeller_b2,
        d2=result.impeller_d2,
        blade_count=result.blade_count,
        beta2=result.beta2,
        head=head,
    )
    return {
        "tip_clearance_mm": tip_clearance_mm,
        "d2_mm": round(result.impeller_d2 * 1000, 1),
        "b2_mm": round(result.impeller_b2 * 1000, 2),
        "blade_count": result.blade_count,
        "beta2_deg": round(result.beta2, 1),
        **loss,
    }


# ---------------------------------------------------------------------------
# NP2 — Surface roughness correction
# ---------------------------------------------------------------------------

@router.post("/sizing/roughness")
def roughness_endpoint(
    flow_rate: float,
    head: float,
    rpm: float,
    roughness_ra_um: float = 6.3,
) -> dict:
    """Calculate roughness-induced efficiency penalty (NP2).

    Args:
        flow_rate: Q [m³/s].
        head: H [m].
        rpm: RPM.
        roughness_ra_um: Average surface roughness Ra [µm]
            (typical: 0.8 µm polished, 6.3 µm machined, 50 µm cast iron).

    Returns:
        Roughness correction metrics.
    """
    from hpe.sizing import run_sizing
    from hpe.physics.roughness import calc_roughness_correction

    _validate_op(flow_rate, head, rpm)
    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    result = run_sizing(op)

    correction = calc_roughness_correction(
        roughness_ra=roughness_ra_um * 1e-6,
        d2=result.impeller_d2,
        b2=result.impeller_b2,
        flow_rate=flow_rate,
        rpm=rpm,
        nq=result.specific_speed_nq,
    )
    return {
        "roughness_ra_um": roughness_ra_um,
        "d2_mm": round(result.impeller_d2 * 1000, 1),
        "b2_mm": round(result.impeller_b2 * 1000, 2),
        "baseline_efficiency": round(result.estimated_efficiency, 5),
        "corrected_efficiency": round(
            max(0.0, result.estimated_efficiency - correction["efficiency_penalty"]), 5
        ),
        **correction,
    }


# ---------------------------------------------------------------------------
# NP3 — Parametric speed sweep
# ---------------------------------------------------------------------------

@router.post("/sizing/speed_sweep")
async def sizing_speed_sweep(
    flow_rate: float,
    head: float,
    rpm_vector: str = "800,1000,1200,1450,1750",
) -> dict:
    """Run sizing at multiple rotational speeds (NP3).

    Equivalent to TURBOdesignPre ANALYSIS_ROTATIONAL_SPEED_VECTOR.
    Returns design comparison across speed range.

    Args:
        flow_rate: Q [m³/s].
        head: H [m].
        rpm_vector: Comma-separated RPM values.

    Returns:
        Dict with per-speed sizing results and optimal speed identified.
    """
    from hpe.sizing.meanline import run_sizing

    speeds = [float(n.strip()) for n in rpm_vector.split(",") if n.strip()]

    def _size_at_speed(n_rpm: float) -> dict:
        _validate_op(flow_rate, head, n_rpm)
        op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=n_rpm)
        result = run_sizing(op)
        return {
            "rpm": n_rpm,
            "nq": round(result.specific_speed_nq, 1),
            "d2_mm": round(result.impeller_d2 * 1000, 1),
            "b2_mm": round(result.impeller_b2 * 1000, 2),
            "eta_pct": round(result.estimated_efficiency * 100, 1),
            "npsh_r": round(result.estimated_npsh_r, 2),
            "power_kw": round(result.estimated_power / 1000, 2),
            "blade_count": result.blade_count,
            "beta2": round(result.beta2, 1),
        }

    loop = asyncio.get_event_loop()
    results = await asyncio.gather(
        *[loop.run_in_executor(None, _size_at_speed, n) for n in speeds]
    )
    results_list = list(results)

    return {
        "flow_rate_m3h": round(flow_rate * 3600, 1),
        "head_m": head,
        "speeds": results_list,
        "optimal": max(results_list, key=lambda r: r["eta_pct"]),
    }


# ---------------------------------------------------------------------------
# NP4 — Return channel sizing
# ---------------------------------------------------------------------------

@router.post("/sizing/return_channel")
def return_channel_endpoint(
    flow_rate: float,
    head: float,
    rpm: float,
    n_stages: int = 2,
) -> dict:
    """Size the return channel for a multi-stage centrifugal pump (NP4).

    Covers radial diffuser + return guide vanes for stage-to-stage transition.

    Args:
        flow_rate: Q [m³/s].
        head: Single-stage head [m].
        rpm: RPM.
        n_stages: Total number of stages (default 2).

    Returns:
        Return channel geometry dict.
    """
    from hpe.sizing import run_sizing
    from hpe.sizing.return_channel import size_return_channel

    _validate_op(flow_rate, head, rpm)
    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    result = run_sizing(op)

    geom = size_return_channel(
        d2=result.impeller_d2,
        b2=result.impeller_b2,
        flow_rate=flow_rate,
        head=head,
        rpm=rpm,
        n_stages=n_stages,
    )
    return {
        "impeller_d2_mm": round(result.impeller_d2 * 1000, 1),
        "impeller_b2_mm": round(result.impeller_b2 * 1000, 2),
        "n_stages": n_stages,
        "d3_mm": round(geom.d3 * 1000, 1),
        "b3_mm": round(geom.b3 * 1000, 2),
        "d4_mm": round(geom.d4 * 1000, 1),
        "d5_mm": round(geom.d5 * 1000, 1),
        "b5_mm": round(geom.b5 * 1000, 2),
        "return_vane_count": geom.blade_count,
        "beta3_deg": geom.beta3,
        "beta5_deg": geom.beta5,
        "axial_length_mm": round(geom.axial_length * 1000, 1),
        "loss_coefficient": geom.loss_coefficient,
        "head_loss_m": round(head * geom.loss_coefficient, 3),
    }


# ---------------------------------------------------------------------------
# NP5 — Multi-stage with work split
# ---------------------------------------------------------------------------

@router.post("/sizing/multistage")
def multistage_endpoint(
    flow_rate: float,
    total_head: float,
    rpm: float,
    n_stages: int | None = None,
    head_distribution: str = "equal",
    work_split: str = "",
) -> dict:
    """Size a multi-stage centrifugal pump (NP5).

    Supports equal/optimized/decreasing head distribution and an explicit
    per-stage work split vector.

    Args:
        flow_rate: Q [m³/s].
        total_head: Total H [m].
        rpm: RPM.
        n_stages: Number of stages. Auto-determined if omitted.
        head_distribution: equal | optimized | decreasing.
        work_split: Comma-separated weights for unevenly distributing head
            (e.g. "0.4,0.3,0.3"). Overrides head_distribution when provided.

    Returns:
        Multi-stage sizing summary with per-stage details.
    """
    from hpe.sizing.multistage import size_multistage

    _validate_op(flow_rate, total_head, rpm)

    split_vec: list[float] | None = None
    if work_split.strip():
        try:
            split_vec = [float(w) for w in work_split.split(",") if w.strip()]
        except ValueError:
            raise HTTPException(status_code=422, detail="work_split must be comma-separated floats.")

    ms = size_multistage(
        flow_rate=flow_rate,
        total_head=total_head,
        rpm=rpm,
        n_stages=n_stages,
        head_distribution=head_distribution,
        work_split_vector=split_vec,
    )

    stages_out = []
    for s in ms.stages:
        stages_out.append({
            "stage": s.stage_number,
            "head_m": round(s.sizing.head if hasattr(s.sizing, "head") else total_head / ms.n_stages, 2),
            "head_fraction": round(s.head_fraction, 4),
            "nq": round(s.nq, 1),
            "d2_mm": round(s.sizing.impeller_d2 * 1000, 1),
            "b2_mm": round(s.sizing.impeller_b2 * 1000, 2),
            "eta": round(s.sizing.estimated_efficiency, 4),
            "power_kw": round(s.sizing.estimated_power / 1000, 2),
            "outlet_pressure_kpa": round(s.outlet_pressure / 1000, 1),
        })

    # Also run enhanced MultiStageDesigner for extra per-stage detail
    from hpe.sizing.multistage import MultiStageDesigner
    designer = MultiStageDesigner(
        total_head=total_head,
        flow_rate=flow_rate,
        rpm=rpm,
        n_stages=n_stages,
    )
    enhanced = designer.design()

    enhanced_stages = []
    for sd in enhanced.stages:
        enhanced_stages.append({
            "stage": sd.stage_number,
            "head_gross_m": round(sd.head, 3),
            "head_net_m": round(sd.net_head, 3),
            "efficiency": round(sd.efficiency, 4),
            "d2_mm": round(sd.d2 * 1000, 1),
            "nq": round(sd.nq, 1),
            "power_kw": round(sd.power / 1000, 2),
            "interstage_head_loss_m": round(sd.interstage_head_loss, 4),
            "seal_leakage_m3s": round(sd.seal_leakage_flow, 6),
            "disc_friction_kw": round(sd.disc_friction_power / 1000, 3),
            "inlet_pressure_kpa": round(sd.inlet_pressure / 1000, 1),
            "outlet_pressure_kpa": round(sd.outlet_pressure / 1000, 1),
            "temperature_rise_k": round(sd.temperature_rise, 3),
        })

    return {
        "n_stages": ms.n_stages,
        "total_head_m": ms.total_head,
        "total_power_kw": round(ms.total_power / 1000, 2),
        "overall_efficiency": round(ms.overall_efficiency, 4),
        "stages": stages_out,
        "enhanced_stages": enhanced_stages,
        "mechanical_efficiency": round(enhanced.mechanical_efficiency, 4),
        "seal_efficiency": round(enhanced.seal_efficiency, 4),
        "enhanced_overall_efficiency": round(enhanced.overall_efficiency, 4),
        "stage_count_optimization": enhanced.stage_count_optimization,
        "warnings": ms.warnings + enhanced.warnings,
    }


# ---------------------------------------------------------------------------
# NP8 — Axial compressor 1D sizing
# ---------------------------------------------------------------------------

@router.post("/sizing/axial_compressor")
def axial_compressor_endpoint(
    flow_rate: float,
    pressure_ratio: float,
    rpm: float,
    n_stages: int = 1,
    inlet_temperature: float = 288.15,
    inlet_pressure: float = 101325.0,
    gamma: float = 1.4,
    r_gas: float = 287.05,
) -> dict:
    """Size an axial compressor stage using compressible flow parameters (NP8).

    Uses the free-vortex design method from hpe.sizing.axial with
    an equivalent head derived from the isentropic total enthalpy rise.

    Args:
        flow_rate: Mass flow rate [kg/s] (compressible convention).
        pressure_ratio: Total-to-total pressure ratio (p02/p01).
        rpm: RPM.
        n_stages: Number of stages (head split equally).
        inlet_temperature: T01 [K].
        inlet_pressure: p01 [Pa].
        gamma: Ratio of specific heats (default 1.4 for air).
        r_gas: Gas constant [J/(kg·K)] (default 287.05 for air).

    Returns:
        Dict with compressor sizing results and velocity triangle data.
    """
    from hpe.sizing.axial import size_axial

    if pressure_ratio <= 1.0:
        raise HTTPException(status_code=422, detail="pressure_ratio must be > 1.0")
    if n_stages < 1:
        raise HTTPException(status_code=422, detail="n_stages must be >= 1")

    # Isentropic enthalpy rise for the full machine
    T02_is = inlet_temperature * pressure_ratio ** ((gamma - 1) / gamma)
    delta_h0_is = r_gas * gamma / (gamma - 1) * inlet_temperature * (
        pressure_ratio ** ((gamma - 1) / gamma) - 1
    )

    # Per-stage enthalpy rise (equal work split)
    delta_h0_stage = delta_h0_is / n_stages

    # Convert to equivalent head for the axial sizing model
    # Using inlet density for a rough volumetric flow
    rho_in = inlet_pressure / (r_gas * inlet_temperature)
    vol_flow = flow_rate / rho_in  # m³/s (inlet conditions)
    g = 9.81
    head_equiv = delta_h0_stage / g  # [m] — isentropic head per stage

    # Validate equivalent operating point
    if vol_flow <= 0 or head_equiv <= 0:
        raise HTTPException(status_code=422, detail="Invalid compressor operating point.")

    op = OperatingPoint(flow_rate=vol_flow, head=head_equiv, rpm=rpm)
    axial = size_axial(op)

    # Per-stage pressure ratio
    pr_stage = pressure_ratio ** (1.0 / n_stages)

    return {
        # Operating conditions
        "n_stages": n_stages,
        "pressure_ratio_total": pressure_ratio,
        "pressure_ratio_per_stage": round(pr_stage, 4),
        "inlet_temperature_k": inlet_temperature,
        "inlet_pressure_pa": inlet_pressure,
        "mass_flow_kgs": flow_rate,
        "inlet_density_kgm3": round(rho_in, 4),
        "volumetric_flow_m3s": round(vol_flow, 6),
        # Isentropic work
        "delta_h0_total_jkg": round(delta_h0_is, 1),
        "delta_h0_stage_jkg": round(delta_h0_stage, 1),
        "head_equiv_m": round(head_equiv, 2),
        # Geometry (per stage)
        "nq": round(axial.nq, 1),
        "d_tip_mm": round(axial.d_tip * 1000, 1),
        "d_hub_mm": round(axial.d_hub * 1000, 1),
        "d_mean_mm": round(axial.d_mean * 1000, 1),
        "hub_tip_ratio": round(axial.hub_tip_ratio, 3),
        "blade_height_mm": round(axial.blade_height * 1000, 1),
        "blade_count": axial.blade_count,
        "chord_mm": round(axial.chord * 1000, 1),
        "solidity": round(axial.solidity, 3),
        "stagger_angle_deg": round(axial.stagger_angle, 1),
        # Aerodynamics
        "beta1_mean_deg": round(axial.beta1_mean, 1),
        "beta2_mean_deg": round(axial.beta2_mean, 1),
        "alpha1_mean_deg": round(axial.alpha1_mean, 1),
        "alpha2_mean_deg": round(axial.alpha2_mean, 1),
        "de_haller": round(axial.de_haller, 3),
        "diffusion_factor": round(axial.diffusion_factor, 3),
        "axial_velocity_ms": round(axial.axial_velocity, 2),
        "reaction_degree": round(axial.reaction_degree, 3),
        # Performance
        "estimated_isentropic_efficiency": round(axial.estimated_efficiency, 4),
        "estimated_shaft_power_kw": round(axial.estimated_power / 1000, 2),
        "warnings": axial.warnings,
    }
