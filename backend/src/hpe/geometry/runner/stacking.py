"""Blade stacking (lean, sweep, bow) for centrifugal impellers.

Stacking defines how blade sections at different spanwise stations
are shifted relative to each other in the circumferential (theta)
direction. This creates 3D blade shapes that influence secondary
flows, noise, and structural loading.

Types of stacking:
1. Lean — uniform angular shift across span (tilts blade)
2. Sweep — axial shift of sections (forward/backward sweep)
3. Bow — non-linear angular shift creating a curved stacking line

The stacking is applied as a theta offset to each spanwise section
after the 2D blade profile is generated.

References:
    - Zangeneh, M. (1991). Three-dimensional design of radial-inflow
      turbines.
    - Denton & Xu (1999). The effects of lean and sweep on transonic
      fan performance.
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed., Ch. 7.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum


class StackingType(str, Enum):
    """Type of blade stacking."""

    RADIAL = "radial"  # No stacking (straight radial blade)
    LEAN = "lean"  # Linear angular offset across span
    SWEEP = "sweep"  # Axial displacement of sections
    BOW = "bow"  # Parabolic angular offset (bowed blade)
    CUSTOM = "custom"  # User-defined stacking curve


@dataclass
class StackingSpec:
    """Specification for blade stacking.

    The stacking line defines the angular offset θ_stack(s) as a
    function of span fraction s ∈ [0, 1] (0=hub, 1=shroud).
    """

    stacking_type: StackingType = StackingType.RADIAL

    # Lean: linear offset from hub to shroud [degrees]
    # Positive = shift toward suction side at shroud
    lean_angle: float = 0.0

    # Sweep: axial displacement [m]
    # Positive = forward sweep (LE of shroud ahead of hub)
    sweep_distance: float = 0.0

    # Bow: parabolic offset [degrees]
    # Maximum angular offset occurs at midspan
    bow_angle: float = 0.0

    # Stacking reference: where on the chord the stacking is applied
    # 0 = leading edge, 1 = trailing edge, 0.5 = mid-chord
    stacking_position: float = 0.0  # Default: stack at LE

    # Custom stacking: list of (span_fraction, theta_offset_deg)
    custom_points: list[tuple[float, float]] = field(default_factory=list)


@dataclass
class StackingResult:
    """Result of applying stacking to blade sections."""

    # Angular offsets at each span station [deg]
    theta_offsets: list[float]

    # Span fractions
    span_fractions: list[float]

    # Stacking line in (span, theta_offset) space
    stacking_line: list[tuple[float, float]]

    # Quality metrics
    max_lean_angle: float  # Maximum lean angle [deg]
    le_sweep_angle: float  # LE sweep angle [deg]
    le_bow_ratio: float  # LE bow curvature metric


def compute_stacking(
    spec: StackingSpec,
    n_spans: int = 5,
) -> StackingResult:
    """Compute the stacking offsets for each spanwise station.

    Args:
        spec: Stacking specification.
        n_spans: Number of spanwise stations.

    Returns:
        StackingResult with theta offsets and metrics.
    """
    span_fractions = [i / (n_spans - 1) for i in range(n_spans)] if n_spans > 1 else [0.5]

    offsets: list[float] = []

    for s in span_fractions:
        theta = _compute_offset_at_span(spec, s)
        offsets.append(theta)

    stacking_line = list(zip(span_fractions, offsets))

    # Metrics
    max_lean = max(abs(o) for o in offsets)
    le_sweep = _calc_le_sweep_angle(offsets, span_fractions)
    le_bow = _calc_le_bow_ratio(offsets, span_fractions)

    return StackingResult(
        theta_offsets=offsets,
        span_fractions=span_fractions,
        stacking_line=stacking_line,
        max_lean_angle=max_lean,
        le_sweep_angle=le_sweep,
        le_bow_ratio=le_bow,
    )


def apply_stacking_to_sections(
    blade_sections: list[list[tuple[float, float]]],
    stacking: StackingResult,
) -> list[list[tuple[float, float]]]:
    """Apply stacking offsets to blade sections.

    Each section's theta coordinates are shifted by the stacking
    offset at that span.

    Args:
        blade_sections: List of blade sections, each a list of (r, theta).
        stacking: StackingResult with theta_offsets.

    Returns:
        New blade sections with stacking applied.
    """
    if len(blade_sections) != len(stacking.theta_offsets):
        raise ValueError(
            f"Number of sections ({len(blade_sections)}) must match "
            f"number of stacking offsets ({len(stacking.theta_offsets)})"
        )

    stacked_sections: list[list[tuple[float, float]]] = []

    for section, offset_deg in zip(blade_sections, stacking.theta_offsets):
        offset_rad = math.radians(offset_deg)
        stacked = [(r, theta + offset_rad) for r, theta in section]
        stacked_sections.append(stacked)

    return stacked_sections


def _compute_offset_at_span(spec: StackingSpec, s: float) -> float:
    """Compute angular offset at a given span fraction.

    Returns offset in degrees.
    """
    if spec.stacking_type == StackingType.RADIAL:
        return 0.0

    elif spec.stacking_type == StackingType.LEAN:
        # Linear from 0 at hub to lean_angle at shroud
        return spec.lean_angle * s

    elif spec.stacking_type == StackingType.SWEEP:
        # Sweep is an axial displacement; convert to approximate
        # angular offset using a typical radius
        # θ_offset ≈ sweep_distance / r_mean (small angle approx)
        # We return the sweep_distance as a pseudo-angle for now;
        # actual application requires knowing the radius
        return spec.sweep_distance * s * 100  # Scale to degrees approx

    elif spec.stacking_type == StackingType.BOW:
        # Parabolic: max at midspan, zero at hub and shroud
        # θ(s) = bow_angle * 4 * s * (1 - s)
        return spec.bow_angle * 4.0 * s * (1.0 - s)

    elif spec.stacking_type == StackingType.CUSTOM:
        return _interpolate_custom(spec.custom_points, s)

    return 0.0


def _interpolate_custom(
    points: list[tuple[float, float]],
    s: float,
) -> float:
    """Piecewise linear interpolation of custom stacking points."""
    if not points:
        return 0.0

    pts = sorted(points)

    if s <= pts[0][0]:
        return pts[0][1]
    if s >= pts[-1][0]:
        return pts[-1][1]

    for i in range(len(pts) - 1):
        s0, t0 = pts[i]
        s1, t1 = pts[i + 1]
        if s0 <= s <= s1:
            frac = (s - s0) / (s1 - s0) if (s1 - s0) > 0 else 0.0
            return t0 + frac * (t1 - t0)

    return pts[-1][1]


def _calc_le_sweep_angle(offsets: list[float], spans: list[float]) -> float:
    """Calculate LE sweep angle from hub to shroud."""
    if len(offsets) < 2:
        return 0.0
    return abs(offsets[-1] - offsets[0])


def _calc_le_bow_ratio(offsets: list[float], spans: list[float]) -> float:
    """Calculate bow ratio: midspan offset / tip offset."""
    if len(offsets) < 3:
        return 0.0
    mid_idx = len(offsets) // 2
    tip_offset = max(abs(offsets[0]), abs(offsets[-1]), 1e-10)
    return abs(offsets[mid_idx]) / tip_offset
