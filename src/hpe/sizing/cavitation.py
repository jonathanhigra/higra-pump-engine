"""Cavitation analysis — NPSH required and cavitation index.

Estimates the Net Positive Suction Head required (NPSHr) and
the Thoma cavitation number (sigma) for preliminary sizing.

References:
    - Gulich (2014), Ch. 6.
    - Thoma, D. (1937). Kavitation bei Wasserturbinen.
"""

from __future__ import annotations

import math

from hpe.core.models import G


def calc_thoma_sigma(nq: float) -> float:
    """Estimate Thoma cavitation number from specific speed.

    sigma_c = (nq / C)^(4/3)

    C depends on suction conditions. Typical values:
        C = 800-1100 for standard suction conditions.
    We use C = 900 as a conservative middle estimate.

    Args:
        nq: Metric specific speed.

    Returns:
        Thoma cavitation number sigma (dimensionless).
    """
    c_thoma = 900.0
    sigma = (nq / c_thoma) ** (4.0 / 3.0)
    return sigma


def calc_npsh_required_thoma(head: float, nq: float) -> float:
    """Calculate NPSHr using Thoma's method.

    NPSHr = sigma * H

    Args:
        head: Total head H [m].
        nq: Metric specific speed.

    Returns:
        NPSHr [m].
    """
    sigma = calc_thoma_sigma(nq)
    return sigma * head


def calc_npsh_required_inlet(
    flow_rate: float,
    d1: float,
    d1_hub: float,
    rpm: float,
    lambda_c: float = 1.1,
) -> float:
    """Calculate NPSHr based on inlet eye velocity.

    NPSHr = lambda_c * (w1^2 / (2g)) where w1 is the relative
    velocity at the blade leading edge.

    A simpler approach uses the meridional velocity at the eye:
        NPSHr ~ lambda_c * c_eye^2 / (2g)
    where c_eye = Q / A_eye and A_eye = pi/4 * (D1^2 - D1_hub^2)

    Args:
        flow_rate: Q [m^3/s].
        d1: Inlet diameter [m].
        d1_hub: Hub diameter at inlet [m].
        rpm: Rotational speed [rev/min].
        lambda_c: Cavitation coefficient (1.0-1.5, higher = more conservative).

    Returns:
        NPSHr [m].
    """
    # Eye area
    a_eye = math.pi / 4.0 * (d1**2 - d1_hub**2)
    c_eye = flow_rate / a_eye

    # Peripheral velocity at D1
    u1 = math.pi * d1 * rpm / 60.0

    # Relative velocity at leading edge (worst case: no pre-swirl)
    w1 = math.sqrt(c_eye**2 + u1**2)

    npsh_r = lambda_c * w1**2 / (2.0 * G)
    return npsh_r


def calc_npsh_required(
    flow_rate: float,
    head: float,
    d1: float,
    d1_hub: float,
    rpm: float,
    nq: float,
) -> tuple[float, float]:
    """Calculate NPSHr using both methods and return the higher (conservative).

    Args:
        flow_rate: Q [m^3/s].
        head: H [m].
        d1: Inlet diameter [m].
        d1_hub: Hub diameter [m].
        rpm: Rotational speed [rev/min].
        nq: Metric specific speed.

    Returns:
        Tuple of (NPSHr [m], sigma).
    """
    npsh_thoma = calc_npsh_required_thoma(head, nq)
    npsh_inlet = calc_npsh_required_inlet(flow_rate, d1, d1_hub, rpm)

    # Take the higher value for conservative sizing
    npsh_r = max(npsh_thoma, npsh_inlet)
    sigma = npsh_r / head if head > 0 else 0.0

    return npsh_r, sigma
