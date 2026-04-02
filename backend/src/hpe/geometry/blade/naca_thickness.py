"""NACA 4-digit series thickness distribution for turbomachinery blades.

Provides streamwise and spanwise thickness control following ADT TurboDesign1
conventions. The NACA 4-digit series (e.g., NACA 0012) is widely used in
turbomachinery for its smooth, well-characterized thickness distribution.
"""
from __future__ import annotations
from dataclasses import dataclass
import math


@dataclass
class ThicknessProfile:
    """Blade thickness distribution result."""
    m_normalized: list[float]    # streamwise stations 0→1
    t_normalized: list[float]    # t/t_max at each station
    t_max_over_chord: float      # t_max/chord ratio (e.g., 0.08 for NACA 08xx)
    leading_edge_radius: float   # LE radius / chord (from NACA formula)
    trailing_edge_angle_deg: float  # TE half-wedge angle [deg]
    n_points: int


def naca_thickness(
    t_max_frac: float = 0.08,
    n_points: int = 21,
    close_te: bool = True,
) -> ThicknessProfile:
    """Compute NACA 4-digit symmetric thickness distribution.

    The NACA 4-digit formula (open TE):
        t(x) = 5 * t * (0.2969*√x - 0.1260*x - 0.3516*x² + 0.2843*x³ - 0.1015*x⁴)

    Closed TE modification replaces the last coefficient:
        -0.1015 → -0.1036 (exact closure at x=1)

    Args:
        t_max_frac: Maximum thickness as fraction of chord (e.g., 0.08 = NACA xx08)
        n_points: Number of streamwise stations
        close_te: If True, use closed trailing edge variant

    Returns:
        ThicknessProfile with normalized stations and thickness values
    """
    if not 0.01 <= t_max_frac <= 0.30:
        raise ValueError(f"t_max_frac must be in [0.01, 0.30], got {t_max_frac}")

    last_coeff = -0.1036 if close_te else -0.1015

    m_stations = [i / (n_points - 1) for i in range(n_points)]
    t_values = []
    t_raw_max = 0.0

    for x in m_stations:
        t = 5.0 * (
            0.2969 * math.sqrt(x)
            - 0.1260 * x
            - 0.3516 * x ** 2
            + 0.2843 * x ** 3
            + last_coeff * x ** 4
        )
        t_values.append(max(0.0, t))
        if t > t_raw_max:
            t_raw_max = t

    # Normalize to [0, 1]
    t_normalized = [v / t_raw_max if t_raw_max > 0 else 0.0 for v in t_values]

    # LE radius for NACA 4-digit: r_le = 1.1019 * t²
    le_radius = 1.1019 * t_max_frac ** 2

    # TE half-wedge angle
    # At x near 1, dt/dx → determines TE angle
    # For NACA 4-digit, typical TE angle is ~12° for t=0.12
    te_angle_deg = math.degrees(math.atan(2.0 * t_max_frac * 0.234))  # approx

    return ThicknessProfile(
        m_normalized=m_stations,
        t_normalized=t_normalized,
        t_max_over_chord=t_max_frac,
        leading_edge_radius=le_radius,
        trailing_edge_angle_deg=te_angle_deg,
        n_points=n_points,
    )


def ellipse_thickness(
    t_max_frac: float = 0.08,
    le_ratio: float = 2.0,
    te_ratio: float = 1.0,
    n_points: int = 21,
) -> ThicknessProfile:
    """Elliptical leading and trailing edge with flat mid-section.

    Used in ADT TurboDesign1 for the LETE modification. The blade has:
    - Elliptical LE of half-axes (le_ratio * t_max, t_max/2)
    - Flat mid-section at t_max
    - Elliptical TE of half-axes (te_ratio * t_max, t_max/2)

    Args:
        t_max_frac: Maximum thickness as fraction of chord
        le_ratio: LE ellipse semi-major / semi-minor ratio (controls LE sharpness)
        te_ratio: TE ellipse ratio (< 1 = sharp, > 1 = blunt)
        n_points: Number of streamwise stations

    Returns:
        ThicknessProfile
    """
    m_stations = [i / (n_points - 1) for i in range(n_points)]
    t_values = []

    le_extent = le_ratio * t_max_frac   # LE ellipse extends this far in chord
    te_extent = te_ratio * t_max_frac   # TE ellipse extends this far in chord

    for x in m_stations:
        if x <= le_extent and le_extent > 0:
            # LE ellipse: t(x) = t_max * sqrt(1 - ((x - le_extent)/le_extent)²)
            xi = (x - le_extent) / le_extent
            t = t_max_frac * math.sqrt(max(0.0, 1.0 - xi ** 2))
        elif x >= (1.0 - te_extent) and te_extent > 0:
            # TE ellipse
            xi = (x - (1.0 - te_extent)) / te_extent
            t = t_max_frac * math.sqrt(max(0.0, 1.0 - xi ** 2))
        else:
            t = t_max_frac
        t_values.append(t)

    t_raw_max = max(t_values) if t_values else 1.0
    t_normalized = [v / t_raw_max for v in t_values]

    le_radius = t_max_frac / (2 * le_ratio) if le_ratio > 0 else 0.0
    te_angle_deg = math.degrees(math.atan(t_max_frac / te_extent)) if te_extent > 0 else 90.0

    return ThicknessProfile(
        m_normalized=m_stations,
        t_normalized=t_normalized,
        t_max_over_chord=t_max_frac,
        leading_edge_radius=le_radius,
        trailing_edge_angle_deg=te_angle_deg,
        n_points=n_points,
    )


def spanwise_thickness_variation(
    hub_t_max: float,
    mid_t_max: float,
    shr_t_max: float,
    span_pos: float,
) -> float:
    """Interpolate blade thickness at an arbitrary spanwise position.

    Uses quadratic interpolation between hub (0), mid (0.5), shroud (1).

    Args:
        hub_t_max: Max thickness fraction at hub
        mid_t_max: Max thickness fraction at mid-span
        shr_t_max: Max thickness fraction at shroud
        span_pos: Spanwise position 0 (hub) → 1 (shroud)

    Returns:
        Interpolated max thickness fraction
    """
    # Lagrange quadratic through (0, hub), (0.5, mid), (1, shr)
    s = span_pos
    t = (hub_t_max * (s - 0.5) * (s - 1.0) / ((0.0 - 0.5) * (0.0 - 1.0))
         + mid_t_max * s * (s - 1.0) / ((0.5 - 0.0) * (0.5 - 1.0))
         + shr_t_max * s * (s - 0.5) / ((1.0 - 0.0) * (1.0 - 0.5)))
    return max(0.01, t)
