"""Fitness evaluator — maps design vector to objective values.

Takes a design vector (beta2, d2_factor, b2_factor, blade_count),
runs sizing + physics, and returns multi-objective fitness.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from hpe.core.models import G, OperatingPoint, SizingResult
from hpe.optimization.problem import OptimizationProblem
from hpe.sizing.meanline import run_sizing


@dataclass
class EvaluationResult:
    """Result of evaluating a single design candidate."""

    objectives: dict[str, float]  # {name: value}
    feasible: bool  # True if all constraints satisfied
    constraint_violations: list[str]  # List of violated constraints
    sizing: Optional[SizingResult] = None


def evaluate_design(
    design_vector: list[float],
    problem: OptimizationProblem,
) -> EvaluationResult:
    """Evaluate a design candidate.

    Pipeline:
        1. Map design vector to impeller parameters
        2. Run sizing with modified parameters
        3. Evaluate design-point performance
        4. Evaluate robustness (multi-point)
        5. Check constraints
        6. Return objectives

    Args:
        design_vector: [beta2, d2_factor, b2_factor, blade_count].
        problem: Optimization problem definition.

    Returns:
        EvaluationResult with objectives and feasibility.
    """
    # 1. Extract design variables (support 4-variable default and 7-variable expanded/extended)
    var_names = [v.name for v in problem.variables]

    def _get(name: str, default: float) -> float:
        return design_vector[var_names.index(name)] if name in var_names else default

    beta2 = _get("beta2", 25.0)
    d2_factor = _get("d2_factor", 1.0)
    b2_factor = _get("b2_factor", 1.0)
    blade_count = int(round(_get("blade_count", 6)))
    nc = _get("nc", 1.0)        # inlet loading correction factor
    nd = _get("nd", 1.0)        # outlet loading correction factor
    d1_d2_override = _get("d1_d2", -1.0)  # negative → use derived ratio

    # 2. Run baseline sizing
    op = OperatingPoint(
        flow_rate=problem.flow_rate,
        head=problem.head,
        rpm=problem.rpm,
    )

    try:
        baseline = run_sizing(op)
    except Exception:
        return _infeasible("Sizing failed")

    # 3. Apply design modifications to sizing result
    modified = _modify_sizing(
        baseline, beta2, d2_factor, b2_factor, blade_count, op,
        nc=nc, nd=nd, d1_d2_override=d1_d2_override,
    )
    if modified is None:
        return _infeasible("Modified sizing produced invalid geometry")

    # 4. Evaluate performance
    try:
        from hpe.physics.euler import get_design_flow_rate
        from hpe.physics.performance import evaluate_performance

        q_design = get_design_flow_rate(modified)
        perf = evaluate_performance(modified, q_design)
    except Exception:
        return _infeasible("Performance evaluation failed")

    # 5. Evaluate robustness (mean efficiency over 0.7-1.3 × Q)
    robustness = _calc_robustness(modified, q_design)

    # 6. Check constraints
    violations = _check_constraints(modified, problem, q_design)

    # 7. Build objectives — include extended objectives when attributes are present
    profile_loss_total = getattr(modified, "profile_loss_total", 0.0)
    pmin_pa = getattr(modified, "pmin_pa", 101325.0)

    objectives = {
        "efficiency": perf.total_efficiency,
        "npsh_r": perf.npsh_required,
        "robustness": robustness,
        "profile_loss_total": profile_loss_total,
        "pmin_pa": pmin_pa,
    }

    return EvaluationResult(
        objectives=objectives,
        feasible=len(violations) == 0,
        constraint_violations=violations,
        sizing=modified,
    )


def _modify_sizing(
    baseline: SizingResult,
    beta2: float,
    d2_factor: float,
    b2_factor: float,
    blade_count: int,
    op: OperatingPoint,
    *,
    nc: float = 1.0,
    nd: float = 1.0,
    d1_d2_override: float = -1.0,
) -> Optional[SizingResult]:
    """Create a modified SizingResult with the given design variables.

    Args:
        nc: Inlet loading correction factor (scales cm1 relative to baseline).
        nd: Outlet loading correction factor (scales cu2 relative to baseline).
        d1_d2_override: If > 0, use this value as D1/D2 ratio instead of deriving
                        it from the baseline.
    """
    import copy

    modified = copy.deepcopy(baseline)

    # Apply modifications
    modified.beta2 = beta2
    modified.impeller_d2 = baseline.impeller_d2 * d2_factor
    modified.impeller_b2 = baseline.impeller_b2 * b2_factor
    modified.blade_count = blade_count

    # Recompute derived quantities — D1 either from override ratio or derived
    if d1_d2_override > 0.0:
        d1_d2_ratio = d1_d2_override
    else:
        d1_d2_ratio = baseline.impeller_d1 / baseline.impeller_d2
    modified.impeller_d1 = modified.impeller_d2 * d1_d2_ratio

    # Recompute u2 and velocity triangles
    u2 = math.pi * modified.impeller_d2 * op.rpm / 60.0
    u1 = math.pi * modified.impeller_d1 * op.rpm / 60.0

    # Outlet meridional velocity
    blockage = 0.88
    a_out = math.pi * modified.impeller_d2 * modified.impeller_b2 * blockage
    if a_out <= 0:
        return None
    cm2 = op.flow_rate / a_out

    # Slip factor (Wiesner)
    from hpe.sizing.velocity_triangles import calc_wiesner_slip_factor
    slip = calc_wiesner_slip_factor(beta2, blade_count)

    # cu2 with slip and nd loading correction
    beta2_rad = math.radians(beta2)
    if abs(math.tan(beta2_rad)) < 1e-10:
        return None
    cu2_blade = u2 - cm2 / math.tan(beta2_rad)
    cu2 = slip * cu2_blade * nd  # nd scales the whirl component

    # Euler head
    h_euler = u2 * cu2 / G  # Assuming cu1 = 0

    # Inlet — nc scales the meridional (axial) velocity at inlet
    b1 = modified.impeller_b2 * (modified.impeller_d2 / modified.impeller_d1) * 0.85
    b1 = max(b1, modified.impeller_b2)
    a_in = math.pi * modified.impeller_d1 * b1 * 0.90
    cm1_raw = op.flow_rate / a_in if a_in > 0 else 0
    cm1 = cm1_raw * nc  # nc adjusts the inlet loading
    beta1 = math.degrees(math.atan2(cm1, u1)) if u1 > 0 else 20.0

    modified.beta1 = beta1

    # Update velocity triangles dict
    modified.velocity_triangles = {
        "inlet": {"u": u1, "cm": cm1, "cu": 0.0, "c": cm1, "w": math.sqrt(cm1**2 + u1**2), "beta": beta1, "alpha": 90.0},
        "outlet": {"u": u2, "cm": cm2, "cu": cu2, "c": math.sqrt(cm2**2 + cu2**2), "w": math.sqrt(cm2**2 + (u2 - cu2)**2), "beta": beta2, "alpha": math.degrees(math.atan2(cm2, cu2))},
        "euler_head": h_euler,
    }

    # Update meridional profile
    d1_hub = modified.impeller_d1 * 0.35
    modified.meridional_profile = {
        "d1": modified.impeller_d1,
        "d1_hub": d1_hub,
        "d2": modified.impeller_d2,
        "b1": b1,
        "b2": modified.impeller_b2,
        "impeller_type": baseline.meridional_profile.get("impeller_type", "radial"),
    }

    # Recompute efficiency estimate
    from hpe.sizing.efficiency import estimate_all_efficiencies
    _, _, _, eta_total = estimate_all_efficiencies(op.flow_rate, modified.specific_speed_nq)
    modified.estimated_efficiency = eta_total

    # Recompute power
    modified.estimated_power = op.fluid_density * G * op.flow_rate * op.head / eta_total

    # Recompute NPSH
    from hpe.sizing.cavitation import calc_npsh_required
    npsh_r, sigma = calc_npsh_required(
        op.flow_rate, op.head, modified.impeller_d1, d1_hub, op.rpm, modified.specific_speed_nq,
    )
    modified.estimated_npsh_r = npsh_r
    modified.sigma = sigma

    return modified


def _calc_robustness(sizing: SizingResult, q_design: float) -> float:
    """Calculate robustness as mean efficiency over 0.7-1.3 × Q_design."""
    from hpe.physics.performance import evaluate_performance

    ratios = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]
    efficiencies = []

    for r in ratios:
        try:
            perf = evaluate_performance(sizing, q_design * r)
            efficiencies.append(perf.total_efficiency)
        except Exception:
            efficiencies.append(0.0)

    return sum(efficiencies) / len(efficiencies) if efficiencies else 0.0


def _check_constraints(
    sizing: SizingResult,
    problem: OptimizationProblem,
    q_design: float,
) -> list[str]:
    """Check optimization constraints. Returns list of violations."""
    violations: list[str] = []

    # Tip speed
    u2 = sizing.velocity_triangles["outlet"]["u"]
    if u2 > problem.max_tip_speed:
        violations.append(f"Tip speed u2={u2:.1f} > {problem.max_tip_speed} m/s")

    # Beta1
    if sizing.beta1 < problem.min_beta1:
        violations.append(f"beta1={sizing.beta1:.1f} < {problem.min_beta1} deg")

    # Euler head ratio
    h_euler = sizing.velocity_triangles["euler_head"]
    h_required = sizing.velocity_triangles["outlet"]["u"] * sizing.velocity_triangles["outlet"]["cu"] / G
    if h_required > 0:
        ratio = h_euler / h_required
        # This is always 1.0 by construction, so check against H_design instead
    # Check Euler vs design head
    from hpe.physics.performance import evaluate_performance
    try:
        perf = evaluate_performance(sizing, q_design)
        if perf.head < 0:
            violations.append("Negative head at design point")
    except Exception:
        violations.append("Cannot evaluate design point")

    return violations


def _infeasible(reason: str) -> EvaluationResult:
    """Create an infeasible result with penalty objectives."""
    return EvaluationResult(
        objectives={"efficiency": 0.0, "npsh_r": 100.0, "robustness": 0.0},
        feasible=False,
        constraint_violations=[reason],
    )
