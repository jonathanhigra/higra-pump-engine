"""Specific speed calculations and rotor type classification.

Specific speed is the most important single parameter for characterizing
a turbomachine. It determines the general shape of the impeller and
provides the basis for all empirical correlations used in sizing.

References:
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed. Springer.
    - Stepanoff, A.J. (1957). Centrifugal and Axial Flow Pumps. Wiley.
"""

from __future__ import annotations

import math


def calc_specific_speed(
    flow_rate: float,
    head: float,
    rpm: float,
) -> tuple[float, float]:
    """Calculate dimensional specific speed Ns and metric Nq.

    Args:
        flow_rate: Volumetric flow rate Q [m^3/s].
        head: Total head H [m].
        rpm: Rotational speed n [rev/min].

    Returns:
        Tuple of (Ns, Nq) where:
            Ns = n * sqrt(Q) / H^0.75  (dimensional, rpm-m3/s-m)
            Nq = Ns  (same formula in metric system with Q in m3/s)

    Raises:
        ValueError: If any input is non-positive.
    """
    if flow_rate <= 0:
        raise ValueError(f"Flow rate must be positive, got {flow_rate}")
    if head <= 0:
        raise ValueError(f"Head must be positive, got {head}")
    if rpm <= 0:
        raise ValueError(f"RPM must be positive, got {rpm}")

    ns = rpm * math.sqrt(flow_rate) / head**0.75
    # Nq is the same formula when Q is in m3/s and H in m
    nq = ns
    return ns, nq


def classify_impeller_type(nq: float) -> str:
    """Classify impeller type based on specific speed Nq.

    Args:
        nq: Metric specific speed Nq.

    Returns:
        String classification: "radial", "mixed_flow", or "axial".

    Reference: Gulich (2014), Table 2.1.
    """
    if nq < 25:
        return "radial_slow"
    elif nq < 70:
        return "radial"
    elif nq < 160:
        return "mixed_flow"
    else:
        return "axial"


def calc_type_number(
    flow_rate: float,
    head: float,
    rpm: float,
) -> float:
    """Calculate dimensionless type number (specific speed in SI).

    omega_s = omega * sqrt(Q) / (gH)^0.75

    This is truly dimensionless unlike Ns/Nq.

    Args:
        flow_rate: Q [m^3/s].
        head: H [m].
        rpm: n [rev/min].

    Returns:
        Dimensionless type number omega_s.
    """
    from hpe.core.models import G

    omega = 2.0 * math.pi * rpm / 60.0
    return omega * math.sqrt(flow_rate) / (G * head) ** 0.75
