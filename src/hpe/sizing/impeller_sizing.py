"""Impeller (runner) preliminary dimensioning.

Calculates main geometric dimensions of a centrifugal pump impeller
from operating point data and specific speed. All correlations are
based on Gulich (2014) and Stepanoff (1957).

Outputs:
    - D2: Outlet diameter
    - D1: Inlet (eye) diameter
    - b2: Outlet width
    - b1: Inlet width
    - beta1, beta2: Blade angles
    - Z: Number of blades

References:
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed. Springer, Ch. 3 & 7.
    - Stepanoff, A.J. (1957). Centrifugal and Axial Flow Pumps.
    - Pfleiderer, C. (1961). Die Kreiselpumpen. Springer.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from hpe.core.models import G


@dataclass
class ImpellerDimensions:
    """Preliminary impeller dimensions from 1D sizing."""

    d2: float  # Outlet diameter [m]
    d1: float  # Inlet (eye) diameter [m]
    d1_hub: float  # Hub diameter at inlet [m]
    b2: float  # Outlet width [m]
    b1: float  # Inlet width [m]
    beta1: float  # Inlet blade angle [deg]
    beta2: float  # Outlet blade angle [deg]
    blade_count: int  # Number of blades Z
    u2: float  # Outlet peripheral velocity [m/s]


def calc_head_coefficient(nq: float) -> float:
    """Estimate head coefficient psi = 2*g*H / u2^2.

    For centrifugal pumps, psi typically ranges from 0.9 to 1.2.
    Lower Nq (radial) pumps tend to have higher psi.

    Gulich (2014), Fig. 3.21:
        psi ~ 1.21 - 0.77 * (nq/100)  for nq < 100

    Args:
        nq: Metric specific speed.

    Returns:
        Head coefficient psi (dimensionless).
    """
    if nq < 100:
        psi = 1.21 - 0.77 * (nq / 100.0)
    else:
        psi = 0.50  # Axial/mixed-flow approximation

    return max(0.35, min(1.3, psi))


def calc_d1_d2_ratio(nq: float) -> float:
    """Estimate inlet-to-outlet diameter ratio D1/D2 from specific speed.

    Based on Stepanoff (1957) and Gulich (2014) data:
        D1/D2 increases with Nq as the impeller transitions
        from radial to mixed-flow geometry.

    Args:
        nq: Metric specific speed.

    Returns:
        D1/D2 ratio (typically 0.3 to 0.7).
    """
    # Piecewise linear fit to Stepanoff/Gulich data
    if nq < 20:
        ratio = 0.32
    elif nq < 40:
        ratio = 0.32 + 0.005 * (nq - 20)
    elif nq < 70:
        ratio = 0.42 + 0.004 * (nq - 40)
    elif nq < 120:
        ratio = 0.54 + 0.002 * (nq - 70)
    else:
        ratio = 0.64 + 0.001 * (nq - 120)

    return max(0.30, min(0.80, ratio))


def calc_blade_count(d2: float, d1: float, beta1: float, beta2: float) -> int:
    """Estimate number of blades using Pfleiderer correlation.

    Z = 6.5 * (D2 + D1) / (D2 - D1) * sin((beta1 + beta2) / 2)

    Clamped to practical range: 5-12 for centrifugal pumps.

    Args:
        d2: Outlet diameter [m].
        d1: Inlet diameter [m].
        beta1: Inlet blade angle [deg].
        beta2: Outlet blade angle [deg].

    Returns:
        Number of blades (integer).
    """
    beta_avg_rad = math.radians((beta1 + beta2) / 2.0)
    z = 6.5 * (d2 + d1) / (d2 - d1) * math.sin(beta_avg_rad)
    return max(5, min(12, round(z)))


def calc_outlet_width_ratio(nq: float) -> float:
    """Estimate b2/D2 ratio from specific speed.

    b2/D2 increases with Nq — wider passages for higher flow coefficients.

    Based on Gulich (2014), Fig. 3.22.

    Args:
        nq: Metric specific speed.

    Returns:
        b2/D2 ratio.
    """
    if nq < 25:
        ratio = 0.025 + 0.0015 * nq
    elif nq < 60:
        ratio = 0.06 + 0.002 * (nq - 25)
    elif nq < 100:
        ratio = 0.13 + 0.003 * (nq - 60)
    else:
        ratio = 0.25 + 0.002 * (nq - 100)

    return max(0.02, min(0.50, ratio))


def calc_outlet_blade_angle(nq: float) -> float:
    """Estimate outlet blade angle beta2 from specific speed.

    Typical range: 15-40 degrees for centrifugal pumps.
    Higher Nq tends toward higher beta2.

    Args:
        nq: Metric specific speed.

    Returns:
        Beta2 [deg].
    """
    if nq < 25:
        beta2 = 18.0
    elif nq < 50:
        beta2 = 18.0 + 0.3 * (nq - 25)
    elif nq < 100:
        beta2 = 25.5 + 0.15 * (nq - 50)
    else:
        beta2 = 33.0

    return max(15.0, min(40.0, beta2))


def size_impeller(
    flow_rate: float,
    head: float,
    rpm: float,
    nq: float,
    eta_h: float,
) -> ImpellerDimensions:
    """Perform preliminary impeller dimensioning.

    Args:
        flow_rate: Q [m^3/s].
        head: H [m].
        rpm: Rotational speed [rev/min].
        nq: Metric specific speed.
        eta_h: Estimated hydraulic efficiency.

    Returns:
        ImpellerDimensions with all key geometry parameters.
    """
    # 1. Outlet diameter D2 from head coefficient
    psi = calc_head_coefficient(nq)
    # H_euler = eta_h * H (approximately, for sizing)
    # psi = 2 * g * H_euler / u2^2  =>  u2 = sqrt(2 * g * H / (psi * eta_h))
    u2 = math.sqrt(2.0 * G * head / (psi * eta_h))
    d2 = 60.0 * u2 / (math.pi * rpm)

    # 2. Inlet diameter D1
    d1_d2_ratio = calc_d1_d2_ratio(nq)
    d1 = d2 * d1_d2_ratio

    # Hub diameter (typically 30-40% of D1)
    d1_hub = d1 * 0.35

    # 3. Outlet width b2
    b2_d2_ratio = calc_outlet_width_ratio(nq)
    b2 = d2 * b2_d2_ratio

    # 4. Inlet width b1 (from continuity, cm1 ~ cm2 * 1.0-1.1)
    # b1 ~ b2 * (D2/D1) * (cm2/cm1), simplified for sizing:
    b1 = b2 * (d2 / d1) * 0.85  # Slight acceleration at inlet
    b1 = max(b1, b2)  # b1 >= b2 always for centrifugal

    # 5. Blade angles
    beta2 = calc_outlet_blade_angle(nq)

    # beta1 from zero-incidence condition
    u1 = math.pi * d1 * rpm / 60.0
    inlet_area = math.pi * d1 * b1 * 0.90  # blockage
    cm1 = flow_rate / inlet_area
    beta1 = math.degrees(math.atan2(cm1, u1))

    # 6. Number of blades
    blade_count = calc_blade_count(d2, d1, beta1, beta2)

    return ImpellerDimensions(
        d2=d2,
        d1=d1,
        d1_hub=d1_hub,
        b2=b2,
        b1=b1,
        beta1=beta1,
        beta2=beta2,
        blade_count=blade_count,
        u2=u2,
    )
