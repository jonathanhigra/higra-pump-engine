"""Return channel (diffuser + return vanes) sizing for multi-stage pumps.

The return channel guides flow from stage N to stage N+1.
Key components: radial diffuser + return guide vanes + axial inlet.

References:
    Gülich (2014) §10.2 — Return channel design.
    Jansen (1967) — Diffuser design for centrifugal compressors.
"""
from __future__ import annotations
import math
from dataclasses import dataclass


@dataclass
class ReturnChannelGeometry:
    """Return channel geometry for multi-stage pump."""

    d3: float           # Diffuser outlet diameter [m]
    b3: float           # Diffuser outlet width [m]
    d4: float           # Return vane inlet diameter [m]
    d5: float           # Return vane outlet diameter [m]
    b5: float           # Return vane outlet width [m]
    blade_count: int    # Number of return vanes (typically 9-13)
    beta3: float        # Diffuser inlet angle [deg]
    beta5: float        # Return vane outlet angle [deg]
    axial_length: float # Total axial length of return channel [m]
    loss_coefficient: float  # Total pressure loss coefficient


def size_return_channel(
    d2: float,          # Impeller outlet diameter [m]
    b2: float,          # Impeller outlet width [m]
    flow_rate: float,   # Q [m³/s]
    head: float,        # Stage head [m]
    rpm: float,         # RPM
    n_stages: int = 2,  # Total number of stages
) -> ReturnChannelGeometry:
    """Size the return channel for a multi-stage centrifugal pump.

    Args:
        d2, b2: Impeller outlet geometry [m].
        flow_rate: Q [m³/s].
        head: Single-stage head [m].
        rpm: RPM.
        n_stages: Number of stages.

    Returns:
        ReturnChannelGeometry.
    """
    G = 9.81

    # Diffuser geometry (radial diffuser)
    diffuser_ratio = 1.6   # d3/d2 (Gülich §10.2, typical 1.5-1.8)
    d3 = d2 * diffuser_ratio
    b3 = b2 * 0.85  # slight contraction

    # Diffuser inlet angle from velocity triangle
    omega = 2 * math.pi * rpm / 60
    u2 = omega * d2 / 2
    cm2 = flow_rate / (math.pi * d2 * b2 * 0.88)
    alpha2 = math.degrees(math.atan2(cm2, u2 * 0.4))  # absolute flow angle

    beta3 = max(15.0, min(35.0, alpha2 * 0.8))

    # Return vane geometry
    d4 = d3 * 0.95    # return vane inlet ≈ diffuser exit
    d5 = d2 * 0.42    # return vane outlet ≈ next stage D1
    b5 = flow_rate / (math.pi * d5 * 3.0) * (1 / 0.88)  # velocity ≈ 3 m/s

    # Number of return vanes (Pfleiderer recommendation)
    blade_count = max(9, min(15, int(2.5 * 5)))  # typical 9-12

    # Return vane outlet angle (target: axial exit for next stage)
    beta5 = 90.0 - alpha2 * 0.3  # aim for near-axial

    # Axial length estimate
    r2 = d2 / 2
    r3 = d3 / 2
    axial_length = (r3 - r2) * 2.5  # rough estimate

    # Loss coefficient: diffuser + return vanes
    # Gülich §10.2: typical 0.05-0.12 × H per stage
    loss_coeff = 0.07  # 7% of stage head

    return ReturnChannelGeometry(
        d3=round(d3, 4), b3=round(b3, 4),
        d4=round(d4, 4), d5=round(d5, 4), b5=round(b5, 4),
        blade_count=blade_count,
        beta3=round(beta3, 1), beta5=round(beta5, 1),
        axial_length=round(axial_length, 3),
        loss_coefficient=loss_coeff,
    )
