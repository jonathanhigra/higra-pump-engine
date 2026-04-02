"""Blade passage throat area calculation.

The throat is the minimum flow passage area between adjacent blades,
which controls choke flow and onset of cavitation.

References:
    Gülich (2014) §4.2, Appendix A6.
"""

from __future__ import annotations
import math


def calc_throat_area(
    d2: float, b2: float, blade_count: int, beta2: float,
) -> float:
    """Estimate throat area at impeller outlet.

    Approximation: A_throat ≈ π*D2*b2*sin(β2) / Z

    This is the passage cross-section projected perpendicular to relative flow.

    Args:
        d2: Outlet diameter [m].
        b2: Outlet width [m].
        blade_count: Number of blades Z.
        beta2: Outlet blade angle [deg].

    Returns:
        Throat area [m²].
    """
    if blade_count <= 0:
        return 0.0
    pitch = math.pi * d2 / blade_count      # blade pitch at outlet [m]
    t_throat = pitch * math.sin(math.radians(beta2))   # throat opening [m]
    return t_throat * b2


def calc_throat_velocity(flow_rate: float, throat_area: float) -> float:
    """Velocity through the throat [m/s]."""
    if throat_area < 1e-9:
        return 0.0
    return flow_rate / throat_area


def check_throat_loading(throat_area: float, flow_rate: float) -> list[str]:
    """Warnings based on throat velocity."""
    warnings = []
    v_throat = calc_throat_velocity(flow_rate, throat_area)
    if v_throat > 15.0:
        warnings.append(f"Throat velocity {v_throat:.1f} m/s > 15 m/s: choke risk.")
    return warnings
