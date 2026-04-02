"""Multi-stage turbomachinery sizing.

Distributes total head across multiple stages, sizes each stage
independently, and ensures stage matching (flow continuity,
inter-stage conditions).

Supports:
- Centrifugal pump multi-stage (boiler feed, pipeline)
- Axial compressor multi-stage
- Multi-stage turbines (Francis, axial)

The head split can be equal or optimized per stage based on
specific speed considerations.

References:
    - Gulich (2014). Centrifugal Pumps, Ch. 15 (multi-stage).
    - Japikse (1996). Centrifugal Compressor Design, Ch. 9.
    - Dixon & Hall (2014). Fluid Mechanics & Thermo of Turbomachinery.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from hpe.core.models import G, OperatingPoint, SizingResult
from hpe.sizing.meanline import run_sizing
from hpe.sizing.specific_speed import calc_specific_speed


@dataclass
class StageSpec:
    """Specification for one stage in a multi-stage machine."""

    stage_number: int
    head: float  # Stage head [m]
    flow_rate: float  # Through-flow [m³/s]
    rpm: float  # Rotational speed [rpm]
    nq: float  # Stage specific speed
    inlet_pressure: float = 101325.0  # Inlet stagnation pressure [Pa]
    inlet_temperature: float = 293.15  # Inlet temperature [K]


@dataclass
class StageResult:
    """Result for one stage."""

    stage_number: int
    sizing: SizingResult
    nq: float
    head_fraction: float  # Fraction of total head
    outlet_pressure: float  # [Pa]


@dataclass
class MultiStageResult:
    """Complete multi-stage sizing result."""

    n_stages: int
    total_head: float  # [m]
    total_flow_rate: float  # [m³/s]
    total_power: float  # [W]
    overall_efficiency: float
    stages: list[StageResult]
    warnings: list[str]


def determine_stage_count(
    flow_rate: float,
    total_head: float,
    rpm: float,
    nq_target_min: float = 15.0,
    nq_target_max: float = 60.0,
) -> int:
    """Determine optimal number of stages based on specific speed.

    For centrifugal pumps, Nq between 15-60 gives the best efficiency.
    If the single-stage Nq is too low, we split into multiple stages.

    Args:
        flow_rate: Q [m³/s].
        total_head: Total H [m].
        rpm: Rotational speed [rpm].
        nq_target_min: Minimum desirable Nq.
        nq_target_max: Maximum desirable Nq.

    Returns:
        Recommended number of stages.
    """
    ns_total, nq_total = calc_specific_speed(flow_rate, total_head, rpm)

    if nq_total >= nq_target_min:
        return 1  # Single stage is fine

    # Find n_stages such that nq_per_stage is in target range
    for n in range(2, 20):
        h_per_stage = total_head / n
        _, nq_stage = calc_specific_speed(flow_rate, h_per_stage, rpm)
        if nq_stage >= nq_target_min:
            return n

    return 10  # Maximum practical for centrifugal pumps


def distribute_head(
    total_head: float,
    n_stages: int,
    method: str = "equal",
) -> list[float]:
    """Distribute total head across stages.

    Methods:
        equal: Same head per stage
        optimized: First and last stages slightly lower for better NPSH/matching
        decreasing: Higher head in earlier stages (less cavitation risk)

    Args:
        total_head: Total head [m].
        n_stages: Number of stages.
        method: Distribution method.

    Returns:
        List of head per stage [m].
    """
    if n_stages <= 1:
        return [total_head]

    if method == "equal":
        h = total_head / n_stages
        return [h] * n_stages

    elif method == "optimized":
        # First stage: -10% (better NPSH), last: -5%, rest: compensated
        reduction_first = 0.10
        reduction_last = 0.05
        h_base = total_head / n_stages
        heads = [h_base] * n_stages
        heads[0] = h_base * (1.0 - reduction_first)
        heads[-1] = h_base * (1.0 - reduction_last)
        # Redistribute deficit to middle stages
        deficit = total_head - sum(heads)
        n_mid = max(n_stages - 2, 1)
        for i in range(1, n_stages - 1):
            heads[i] += deficit / n_mid
        return heads

    elif method == "decreasing":
        # Linear decrease: first stage gets most head
        weights = [n_stages - i for i in range(n_stages)]
        total_w = sum(weights)
        return [total_head * w / total_w for w in weights]

    return [total_head / n_stages] * n_stages


def size_multistage(
    flow_rate: float,
    total_head: float,
    rpm: float,
    n_stages: int | None = None,
    head_distribution: str = "equal",
    rho: float = 998.2,
    p_inlet: float = 101325.0,
) -> MultiStageResult:
    """Size a complete multi-stage machine.

    Args:
        flow_rate: Q [m³/s].
        total_head: Total H [m].
        rpm: Rotational speed [rpm].
        n_stages: Number of stages. If None, auto-determined.
        head_distribution: Head split method (equal/optimized/decreasing).
        rho: Fluid density [kg/m³].
        p_inlet: Inlet pressure [Pa].

    Returns:
        MultiStageResult with all stage details.
    """
    warnings: list[str] = []

    if n_stages is None:
        n_stages = determine_stage_count(flow_rate, total_head, rpm)

    heads = distribute_head(total_head, n_stages, head_distribution)

    stages: list[StageResult] = []
    total_power = 0.0
    p_current = p_inlet

    for i in range(n_stages):
        h_stage = heads[i]
        _, nq = calc_specific_speed(flow_rate, h_stage, rpm)

        op = OperatingPoint(
            flow_rate=flow_rate,
            head=h_stage,
            rpm=rpm,
        )
        sizing = run_sizing(op)

        # Outlet pressure of this stage = inlet + rho*g*H
        p_out = p_current + rho * G * h_stage

        stages.append(StageResult(
            stage_number=i + 1,
            sizing=sizing,
            nq=nq,
            head_fraction=h_stage / total_head,
            outlet_pressure=p_out,
        ))

        total_power += sizing.estimated_power
        p_current = p_out

        # Warnings
        if nq < 10:
            warnings.append(f"Stage {i+1}: Nq={nq:.1f} is very low. Risk of poor efficiency.")
        if nq > 80:
            warnings.append(f"Stage {i+1}: Nq={nq:.1f} is high. Consider mixed-flow design.")

    # Overall efficiency
    useful_power = rho * G * flow_rate * total_head
    overall_eta = useful_power / total_power if total_power > 0 else 0.0

    # Check diameter consistency (all stages should be similar for common shaft)
    d2_values = [s.sizing.impeller_d2 for s in stages]
    if len(d2_values) > 1:
        d2_spread = (max(d2_values) - min(d2_values)) / max(d2_values)
        if d2_spread > 0.15:
            warnings.append(
                f"D2 varies {d2_spread*100:.0f}% across stages. "
                "May need impeller trimming or different head split."
            )

    return MultiStageResult(
        n_stages=n_stages,
        total_head=total_head,
        total_flow_rate=flow_rate,
        total_power=total_power,
        overall_efficiency=overall_eta,
        stages=stages,
        warnings=warnings,
    )
