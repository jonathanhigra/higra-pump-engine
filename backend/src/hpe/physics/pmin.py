"""Minimum static pressure in the impeller passage.

Pmin occurs on the suction side of the blade near LE, where velocity is maximum.
Used to predict cavitation onset and compare with vapor pressure.

References:
    Gülich (2014) §6.2.5 — Minimum pressure in impeller.
"""
from __future__ import annotations
import math


def calc_pmin(
    flow_rate: float,
    rpm: float,
    d1: float,
    d1_hub: float,
    p_inlet: float = 101325.0,  # Pa absolute
    rho: float = 998.0,
    lambda_w: float = 1.3,      # blade blockage factor at LE (Gülich)
) -> float:
    """Calculate minimum static pressure in impeller (Pa absolute).

    Gülich (2014) Eq. 6.7:
        pmin = p1 - 0.5*rho*w1²*(lambda_w² - 1)

    where lambda_w accounts for velocity increase due to blade blockage at LE.

    Args:
        flow_rate: Q [m³/s].
        rpm: RPM.
        d1: Inlet tip diameter [m].
        d1_hub: Hub diameter [m].
        p_inlet: Static pressure at pump inlet [Pa].
        rho: Fluid density [kg/m³].
        lambda_w: LE blockage/velocity amplification factor (Gülich §6.2, typically 1.2-1.4).

    Returns:
        Minimum static pressure [Pa absolute].
    """
    omega = 2 * math.pi * rpm / 60.0

    # Flow area at inlet
    A1 = math.pi / 4 * (d1 ** 2 - d1_hub ** 2)
    cm1 = flow_rate / A1 if A1 > 1e-9 else 0.1

    # Peripheral velocity at tip
    u1 = omega * d1 / 2

    # Inlet relative velocity
    w1 = math.sqrt(cm1 ** 2 + u1 ** 2)

    # Minimum pressure (Gülich Eq. 6.7)
    pmin = p_inlet - 0.5 * rho * w1 ** 2 * (lambda_w ** 2 - 1)

    return pmin


def check_cavitation(pmin: float, p_vapor: float = 2340.0) -> dict:
    """Check if minimum pressure falls below vapor pressure.

    Args:
        pmin: Minimum pressure [Pa].
        p_vapor: Vapor pressure of fluid [Pa] (water at 20°C = 2340 Pa).

    Returns:
        Dict with cavitation status and safety margin.
    """
    margin = pmin - p_vapor
    return {
        "pmin_pa": round(pmin, 1),
        "p_vapor_pa": round(p_vapor, 1),
        "margin_pa": round(margin, 1),
        "cavitating": margin < 0,
        "safety_factor": round(pmin / p_vapor if p_vapor > 0 else 999, 2),
    }
