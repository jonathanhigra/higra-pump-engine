"""Blade loading distribution functions.

Defines how rVθ (angular momentum) varies along the meridional
coordinate m ∈ [0, 1] from leading edge to trailing edge.

The loading d(rVθ)/dm determines the blade shape: fore-loaded
distributions produce blades with more curvature near the inlet,
while aft-loaded distributions shift curvature toward the outlet.

References:
    - Zangeneh, M. (1991). A compressible three-dimensional design
      method for radial and mixed flow turbomachinery blades.
    - Goto, A. & Zangeneh, M. (2002). Hydrodynamic design of pump
      diffuser using inverse design method and CFD.
"""

from __future__ import annotations

import math

from hpe.geometry.inverse.models import BladeLoadingSpec, LoadingType


def compute_rvt_distribution(
    spec: BladeLoadingSpec,
    m_coords: list[float],
) -> list[float]:
    """Compute rVθ distribution along the meridional coordinate.

    Given the loading specification and a set of meridional coordinates
    m ∈ [0, 1], returns rVθ at each station.

    The distribution satisfies:
        rVθ(0) = rvt_inlet
        rVθ(1) = rvt_outlet
        The shape between is controlled by loading_type.

    Args:
        spec: Blade loading specification.
        m_coords: Normalized meridional coordinates (0=LE, 1=TE).

    Returns:
        List of rVθ values [m²/s] at each m coordinate.
    """
    rvt_in = spec.rvt_inlet
    rvt_out = spec.rvt_outlet
    delta_rvt = rvt_out - rvt_in

    if spec.loading_type == LoadingType.CUSTOM and spec.loading_control_points:
        return _custom_loading(spec, m_coords)

    rvt_values: list[float] = []
    for m in m_coords:
        f = _loading_shape(m, spec.loading_type)
        rvt_values.append(rvt_in + delta_rvt * f)

    return rvt_values


def compute_loading_derivative(
    rvt_values: list[float],
    m_coords: list[float],
) -> list[float]:
    """Compute d(rVθ)/dm — the blade loading derivative.

    This is the actual "loading" that drives blade curvature.
    High values of |d(rVθ)/dm| correspond to high blade turning.

    Args:
        rvt_values: rVθ at each meridional station.
        m_coords: Normalized meridional coordinates.

    Returns:
        d(rVθ)/dm at each station (central differences, forward/backward at ends).
    """
    n = len(rvt_values)
    drvt_dm: list[float] = []

    for i in range(n):
        if i == 0:
            # Forward difference
            dm = m_coords[1] - m_coords[0]
            deriv = (rvt_values[1] - rvt_values[0]) / dm if dm > 0 else 0.0
        elif i == n - 1:
            # Backward difference
            dm = m_coords[-1] - m_coords[-2]
            deriv = (rvt_values[-1] - rvt_values[-2]) / dm if dm > 0 else 0.0
        else:
            # Central difference
            dm = m_coords[i + 1] - m_coords[i - 1]
            deriv = (rvt_values[i + 1] - rvt_values[i - 1]) / dm if dm > 0 else 0.0

        drvt_dm.append(deriv)

    return drvt_dm


def compute_spanwise_rvt(
    spec: BladeLoadingSpec,
    span_fractions: list[float],
) -> list[float]:
    """Compute rVθ_outlet at each spanwise station.

    For free-vortex design: rVθ = constant across span.
    For constant-rVt: same as free-vortex (rVθ = const by definition).
    For custom: interpolate from user-specified values.

    Args:
        spec: Blade loading specification.
        span_fractions: Spanwise positions (0=hub, 1=shroud).

    Returns:
        rVθ_outlet at each span station [m²/s].
    """
    from hpe.geometry.inverse.models import StackingCondition

    if spec.stacking == StackingCondition.CUSTOM and spec.spanwise_rvt:
        return _interpolate_spanwise(spec.spanwise_rvt, span_fractions)

    # Free vortex: rVθ = constant across span
    return [spec.rvt_outlet] * len(span_fractions)


def _loading_shape(m: float, loading_type: LoadingType) -> float:
    """Compute the normalized loading shape function f(m) ∈ [0, 1].

    f(0) = 0, f(1) = 1. The derivative df/dm controls where the
    blade loading is concentrated.

    Fore-loaded:  steep rise near LE → gentle near TE
    Aft-loaded:   gentle near LE → steep rise near TE
    Mid-loaded:   symmetric S-curve (sinusoidal)
    """
    if loading_type == LoadingType.FORE_LOADED:
        # Power law: f = 1 - (1-m)^2.5
        return 1.0 - (1.0 - m) ** 2.5

    elif loading_type == LoadingType.AFT_LOADED:
        # Power law: f = m^2.5
        return m**2.5

    elif loading_type == LoadingType.MID_LOADED:
        # Sinusoidal: f = 0.5 * (1 - cos(pi*m))
        return 0.5 * (1.0 - math.cos(math.pi * m))

    return m  # Linear fallback


def _custom_loading(
    spec: BladeLoadingSpec,
    m_coords: list[float],
) -> list[float]:
    """Compute rVθ from custom control points using monotone interpolation.

    Control points define (m, weight) pairs where weight ∈ [0, 1]
    indicates the cumulative fraction of ΔrVθ applied at that m.
    Endpoints (0, 0) and (1, 1) are always included.
    """
    rvt_in = spec.rvt_inlet
    delta_rvt = spec.rvt_outlet - spec.rvt_inlet

    # Build sorted control points with endpoints
    pts = [(0.0, 0.0)] + sorted(spec.loading_control_points) + [(1.0, 1.0)]

    rvt_values: list[float] = []
    for m in m_coords:
        # Find bounding control points
        f = _piecewise_linear_interp(pts, m)
        rvt_values.append(rvt_in + delta_rvt * f)

    return rvt_values


def _piecewise_linear_interp(
    pts: list[tuple[float, float]],
    x: float,
) -> float:
    """Piecewise linear interpolation."""
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]

    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0) if (x1 - x0) > 0 else 0.0
            return y0 + t * (y1 - y0)

    return pts[-1][1]


def _interpolate_spanwise(
    spanwise_rvt: list[tuple[float, float]],
    span_fractions: list[float],
) -> list[float]:
    """Interpolate custom spanwise rVθ distribution."""
    pts = sorted(spanwise_rvt)
    return [_piecewise_linear_interp(pts, s) for s in span_fractions]
