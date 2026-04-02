"""Meanline 1D sizing orchestrator.

This is the main entry point for the sizing module. Given an OperatingPoint,
it runs the full 1D meanline analysis and returns a SizingResult with all
preliminary dimensions, performance estimates, and warnings.

Usage:
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    result = run_sizing(op)
"""

from __future__ import annotations

import math

from hpe.core.enums import MachineType
from hpe.core.models import G, OperatingPoint, SizingResult
from hpe.sizing.cavitation import calc_npsh_required
from hpe.sizing.efficiency import estimate_all_efficiencies
from hpe.sizing.impeller_sizing import size_impeller
from hpe.sizing.specific_speed import calc_specific_speed, classify_impeller_type
from hpe.sizing.velocity_triangles import (
    calc_euler_head,
    calc_inlet_triangle,
    calc_outlet_triangle,
)


def run_sizing(op: OperatingPoint) -> SizingResult:
    """Run complete 1D meanline sizing analysis.

    Pipeline:
        1. Calculate specific speed (Ns, Nq)
        2. Estimate efficiency
        3. Size impeller (D2, D1, b2, angles, Z)
        4. Calculate velocity triangles
        5. Verify Euler head vs required head
        6. Calculate NPSH and sigma
        7. Calculate power
        8. Generate warnings
        9. Return SizingResult

    Args:
        op: Operating point specification.

    Returns:
        Complete SizingResult with dimensions, performance, and warnings.

    Raises:
        ValueError: If operating point parameters are invalid.
    """
    warnings: list[str] = []

    # 1. Specific speed
    ns, nq = calc_specific_speed(op.flow_rate, op.head, op.rpm)
    impeller_type = classify_impeller_type(nq)

    # Validate machine type vs specific speed
    _validate_machine_type(op.machine_type, nq, warnings)

    # 2. Efficiency estimation
    eta_h, eta_v, eta_m, eta_total = estimate_all_efficiencies(op.flow_rate, nq)

    # 3. Impeller sizing
    imp = size_impeller(op.flow_rate, op.head, op.rpm, nq, eta_h)

    # 4. Velocity triangles
    tri_in = calc_inlet_triangle(
        d1=imp.d1, b1=imp.b1, flow_rate=op.flow_rate, rpm=op.rpm,
    )
    tri_out = calc_outlet_triangle(
        d2=imp.d2, b2=imp.b2, flow_rate=op.flow_rate, rpm=op.rpm,
        beta2=imp.beta2, blade_count=imp.blade_count,
    )

    # 5. Verify Euler head
    h_euler = calc_euler_head(tri_in, tri_out)
    h_required_euler = op.head / eta_h  # Euler head needed to deliver H

    head_ratio = h_euler / h_required_euler if h_required_euler > 0 else 0
    if head_ratio < 0.95:
        warnings.append(
            f"Euler head ({h_euler:.1f} m) is {(1-head_ratio)*100:.0f}% below "
            f"required ({h_required_euler:.1f} m). Consider adjusting beta2 or D2."
        )
    elif head_ratio > 1.10:
        warnings.append(
            f"Euler head ({h_euler:.1f} m) is {(head_ratio-1)*100:.0f}% above "
            f"required ({h_required_euler:.1f} m). Design has excess margin."
        )

    # 6. Cavitation
    npsh_r, sigma = calc_npsh_required(
        flow_rate=op.flow_rate, head=op.head,
        d1=imp.d1, d1_hub=imp.d1_hub,
        rpm=op.rpm, nq=nq,
    )

    # 7. Power
    power = op.fluid_density * G * op.flow_rate * op.head / eta_total

    # 8. Additional warnings
    _check_warnings(imp, tri_in, tri_out, nq, npsh_r, warnings)

    # 9. Build result
    velocity_triangles = {
        "inlet": {
            "u": tri_in.u, "cm": tri_in.cm, "cu": tri_in.cu,
            "c": tri_in.c, "w": tri_in.w, "beta": tri_in.beta,
            "alpha": tri_in.alpha,
        },
        "outlet": {
            "u": tri_out.u, "cm": tri_out.cm, "cu": tri_out.cu,
            "c": tri_out.c, "w": tri_out.w, "beta": tri_out.beta,
            "alpha": tri_out.alpha,
        },
        "euler_head": h_euler,
    }

    meridional_profile = {
        "d1": imp.d1,
        "d1_hub": imp.d1_hub,
        "d2": imp.d2,
        "b1": imp.b1,
        "b2": imp.b2,
        "impeller_type": impeller_type,
    }

    return SizingResult(
        specific_speed_ns=ns,
        specific_speed_nq=nq,
        impeller_d2=imp.d2,
        impeller_d1=imp.d1,
        impeller_b2=imp.b2,
        blade_count=imp.blade_count,
        beta1=imp.beta1,
        beta2=imp.beta2,
        estimated_efficiency=eta_total,
        estimated_power=power,
        estimated_npsh_r=npsh_r,
        sigma=sigma,
        velocity_triangles=velocity_triangles,
        meridional_profile=meridional_profile,
        warnings=warnings,
    )


def _validate_machine_type(
    machine_type: MachineType,
    nq: float,
    warnings: list[str],
) -> None:
    """Check if specific speed is consistent with the selected machine type."""
    if machine_type == MachineType.CENTRIFUGAL_PUMP and nq > 100:
        warnings.append(
            f"Nq={nq:.0f} is high for a centrifugal pump. "
            "Consider mixed-flow or axial configuration."
        )
    elif machine_type == MachineType.AXIAL_PUMP and nq < 100:
        warnings.append(
            f"Nq={nq:.0f} is low for an axial pump. "
            "Consider centrifugal or mixed-flow configuration."
        )


def _check_warnings(
    imp: object,
    tri_in: object,
    tri_out: object,
    nq: float,
    npsh_r: float,
    warnings: list[str],
) -> None:
    """Generate engineering warnings for edge cases."""
    # High tip speed warning (>50 m/s can cause erosion/noise)
    if tri_out.u > 50:  # type: ignore[attr-defined]
        warnings.append(
            f"High outlet tip speed u2={tri_out.u:.1f} m/s. "  # type: ignore[attr-defined]
            "Consider noise and erosion implications."
        )

    # Very low beta2 (risk of high cu2 and separation)
    if imp.beta2 < 17:  # type: ignore[attr-defined]
        warnings.append(
            f"Low outlet blade angle beta2={imp.beta2:.1f} deg. "  # type: ignore[attr-defined]
            "Risk of flow separation in diffuser."
        )

    # High w1/w2 deceleration ratio (should be < 1.4 ideally)
    w_ratio = tri_in.w / tri_out.w if tri_out.w > 0 else 0  # type: ignore[attr-defined]
    if w_ratio > 1.4:
        warnings.append(
            f"High w1/w2 ratio ({w_ratio:.2f}). "
            "Risk of flow separation in impeller passage."
        )

    # NPSH warning
    if npsh_r > 8.0:
        warnings.append(
            f"High NPSHr={npsh_r:.1f} m. "
            "May require booster pump or tank elevation."
        )
