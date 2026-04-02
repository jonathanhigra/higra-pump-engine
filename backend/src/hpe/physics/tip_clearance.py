"""Tip clearance loss model for centrifugal impellers.

Blade tip clearance causes leakage from pressure to suction side,
reducing efficiency and head. This model follows Gülich (2014) §3.6.4.

References:
    Gülich (2014) §3.6.4 — Tip clearance losses.
    Denton (1993) — Loss mechanisms in turbomachines.
"""
from __future__ import annotations
import math


def calc_tip_clearance_loss(
    tip_clearance: float,   # Radial tip clearance [m]
    b2: float,              # Outlet width [m]
    d2: float,              # Outlet diameter [m]
    blade_count: int,       # Number of blades
    beta2: float,           # Outlet blade angle [deg]
    head: float,            # Design head [m]
    rho: float = 998.0,
) -> dict:
    """Calculate tip clearance loss coefficient and head reduction.

    Gülich (2014) Eq. 3.27 simplified:
        delta_eta = k_cl * (s/b2) * (D2/(b2*Z)) * sin(beta2)

    where k_cl ≈ 0.6 for open impellers, 0.3 for semi-open.

    Args:
        tip_clearance: s — radial gap between blade tip and casing [m].
        b2: Channel width at outlet [m].
        d2: Outlet diameter [m].
        blade_count: Z — number of blades.
        beta2: Outlet blade angle [deg].
        head: Design head H [m].

    Returns:
        Dict with loss coefficient, efficiency penalty, and head loss.
    """
    G = 9.81
    s = tip_clearance

    if b2 < 1e-6 or s <= 0:
        return {"efficiency_penalty": 0.0, "head_loss_m": 0.0, "loss_coefficient": 0.0}

    # Clearance ratio
    s_b2 = s / b2

    # Geometric factor
    geo_factor = d2 / (b2 * blade_count) * math.sin(math.radians(beta2))

    # Gülich k_cl for semi-open impeller (centrifugal pump typical)
    k_cl = 0.6

    # Efficiency penalty
    delta_eta = k_cl * s_b2 * geo_factor
    delta_eta = max(0.0, min(0.15, delta_eta))  # cap at 15%

    # Head loss
    h_loss = head * delta_eta

    # Loss coefficient (head loss / (u2²/(2g)))
    u2_approx = math.sqrt(2 * G * head)  # rough estimate
    zeta = (h_loss * 2 * G) / (u2_approx**2) if u2_approx > 0 else 0.0

    return {
        "clearance_ratio": round(s_b2, 4),
        "efficiency_penalty": round(delta_eta, 5),
        "head_loss_m": round(h_loss, 3),
        "loss_coefficient": round(zeta, 5),
        "k_cl": k_cl,
    }
