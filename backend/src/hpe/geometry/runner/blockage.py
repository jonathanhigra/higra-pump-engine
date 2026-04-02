"""Blade-to-blade blockage model for centrifugal impellers.

Blockage accounts for the reduction in effective flow area due to
boundary layers, blade thickness, and secondary flows within the
impeller passage. It directly affects meridional velocity and
pressure distribution.

The blockage factor B(m) ∈ (0, 1] is defined such that:
    A_effective = A_geometric * B(m)
    cm_actual = Q / A_effective

Three methods are provided:
1. Constant — uniform blockage (simplest, typical: 0.85-0.95)
2. Table — user-defined distribution along meridional coordinate
3. Correlation — empirical model based on geometry and Re

References:
    - Japikse, D. (1996). Centrifugal Compressor Design and
      Performance, Ch. 3 (blockage models).
    - Aungier, R.H. (2000). Centrifugal Compressors, Ch. 5.
    - Johnston & Dean (1966). Losses in vaneless diffusers.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum


class BlockageMethod(str, Enum):
    """Method for computing blockage distribution."""

    CONSTANT = "constant"
    TABLE = "table"
    CORRELATION = "correlation"


@dataclass
class BlockageSpec:
    """Specification for passage blockage model."""

    method: BlockageMethod = BlockageMethod.CONSTANT

    # Constant method
    constant_value: float = 0.90  # Typical: 0.85-0.95

    # Table method: list of (m_normalized, blockage_factor)
    # m ∈ [0, 1], blockage ∈ (0, 1]
    table_points: list[tuple[float, float]] = field(default_factory=list)

    # Correlation method parameters
    blade_thickness: float = 0.004  # [m]
    blade_count: int = 7
    surface_roughness: float = 2.0e-6  # [m]


@dataclass
class BlockageDistribution:
    """Computed blockage distribution along meridional coordinate."""

    m_coords: list[float]  # Normalized meridional coordinates
    blockage_factors: list[float]  # B(m) at each station
    mean_blockage: float  # Area-weighted mean
    min_blockage: float  # Minimum (most blocked)
    effective_area_ratio: float  # Mean effective / geometric area


def compute_blockage(
    spec: BlockageSpec,
    m_coords: list[float] | None = None,
    n_points: int = 30,
    d1: float = 0.16,
    d2: float = 0.32,
    b2: float = 0.025,
    rpm: float = 1750.0,
) -> BlockageDistribution:
    """Compute blockage distribution along the meridional coordinate.

    Args:
        spec: Blockage specification.
        m_coords: Normalized meridional coordinates. If None, generates uniform.
        n_points: Number of stations (if m_coords is None).
        d1: Inlet diameter [m] (for correlation method).
        d2: Outlet diameter [m] (for correlation method).
        b2: Outlet width [m] (for correlation method).
        rpm: Rotational speed [rev/min] (for correlation method).

    Returns:
        BlockageDistribution with factors at each station.
    """
    if m_coords is None:
        m_coords = [i / (n_points - 1) for i in range(n_points)]

    if spec.method == BlockageMethod.CONSTANT:
        factors = [spec.constant_value] * len(m_coords)

    elif spec.method == BlockageMethod.TABLE:
        factors = _interpolate_table(spec.table_points, m_coords)

    elif spec.method == BlockageMethod.CORRELATION:
        factors = _correlation_blockage(
            m_coords, spec, d1, d2, b2, rpm,
        )
    else:
        factors = [0.90] * len(m_coords)

    mean_b = sum(factors) / len(factors) if factors else 0.90
    min_b = min(factors) if factors else 0.90

    return BlockageDistribution(
        m_coords=m_coords,
        blockage_factors=factors,
        mean_blockage=mean_b,
        min_blockage=min_b,
        effective_area_ratio=mean_b,
    )


def apply_blockage_to_velocity(
    cm_values: list[float],
    blockage: BlockageDistribution,
) -> list[float]:
    """Correct meridional velocity for blockage.

    cm_corrected = cm / B(m)

    Args:
        cm_values: Meridional velocity at each station [m/s].
        blockage: Blockage distribution.

    Returns:
        Corrected meridional velocities.
    """
    corrected: list[float] = []
    n = min(len(cm_values), len(blockage.blockage_factors))

    for i in range(n):
        b = blockage.blockage_factors[i]
        corrected.append(cm_values[i] / b if b > 0.01 else cm_values[i])

    return corrected


def _interpolate_table(
    table: list[tuple[float, float]],
    m_coords: list[float],
) -> list[float]:
    """Piecewise linear interpolation of blockage table."""
    if not table:
        return [0.90] * len(m_coords)

    pts = sorted(table)
    results: list[float] = []

    for m in m_coords:
        if m <= pts[0][0]:
            results.append(pts[0][1])
        elif m >= pts[-1][0]:
            results.append(pts[-1][1])
        else:
            for i in range(len(pts) - 1):
                m0, b0 = pts[i]
                m1, b1 = pts[i + 1]
                if m0 <= m <= m1:
                    t = (m - m0) / (m1 - m0) if (m1 - m0) > 0 else 0
                    results.append(b0 + t * (b1 - b0))
                    break
            else:
                results.append(pts[-1][1])

    return results


def _correlation_blockage(
    m_coords: list[float],
    spec: BlockageSpec,
    d1: float,
    d2: float,
    b2: float,
    rpm: float,
) -> list[float]:
    """Compute blockage using empirical correlation.

    Combines three components:
    1. Blade thickness blockage — geometric
    2. Boundary layer blockage — grows along passage
    3. Secondary flow blockage — increases toward outlet

    B(m) = 1 - B_thickness(m) - B_bl(m) - B_secondary(m)
    """
    z = spec.blade_count
    t = spec.blade_thickness
    nu = 1.003e-6  # Water kinematic viscosity [m²/s]

    # Tip speed for Reynolds number
    omega = 2.0 * math.pi * rpm / 60.0
    u2 = omega * d2 / 2.0

    factors: list[float] = []

    for m in m_coords:
        r = d1 / 2.0 + m * (d2 / 2.0 - d1 / 2.0)
        pitch = 2.0 * math.pi * r / z

        # 1. Thickness blockage: t / pitch
        b_thickness = t / pitch if pitch > 1e-6 else 0.0

        # 2. Boundary layer blockage: grows with m
        # δ* ~ L * Re^(-0.2) (flat plate)
        l_local = m * math.pi * (d1 + d2) / (2 * z)
        w_local = u2 * (0.5 + 0.5 * m)  # Rough estimate
        re_local = w_local * l_local / nu if l_local > 0 else 1e6
        re_local = max(re_local, 1e3)
        delta_star = l_local * 0.048 * re_local**(-0.2) if l_local > 0 else 0
        b_bl = 2.0 * delta_star / b2 if b2 > 0 else 0.0  # Two walls

        # 3. Secondary flow blockage: increases toward outlet
        b_secondary = 0.02 * m**2  # Small contribution

        # Total
        b_total = 1.0 - b_thickness - b_bl - b_secondary
        b_total = max(0.60, min(1.0, b_total))  # Physical limits

        factors.append(b_total)

    return factors
