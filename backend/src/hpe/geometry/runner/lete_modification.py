"""Leading edge and trailing edge elliptical modification.

Modifies the blade profile near the leading and trailing edges
to create smooth, elliptical edge shapes instead of the blunt
or sharp edges from the basic thickness distribution.

This matches the LETE (Leading Edge / Trailing Edge) modification
capability of ADT TURBOdesign1's Export section.

Types of modifications:
1. Elliptical LE — smooth elliptical leading edge for reduced
   incidence losses and cavitation inception delay
2. Elliptical TE — smooth trailing edge for reduced wake thickness
   and mixing losses
3. Filing — material removal at LE/TE to thin the edge

References:
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed., Ch. 7.
    - Brennen, C.E. (2011). Hydrodynamics of Pumps, Ch. 3
      (leading edge effects on cavitation).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from hpe.geometry.models import BladeProfile


@dataclass
class LETESpec:
    """Specification for LE/TE elliptical modification."""

    # Leading edge
    le_enabled: bool = True
    le_elliptic_ratio: float = 2.0  # Semi-major / semi-minor axis ratio
    le_filing_ratio: float = 0.0  # Additional thinning (0 = none, 1 = full)
    le_extent: float = 0.10  # Fraction of chord affected (0-0.3)

    # Trailing edge
    te_enabled: bool = True
    te_elliptic_ratio: float = 1.5  # TE is typically less blunt
    te_filing_ratio: float = 0.0
    te_extent: float = 0.10

    # Minimum edge thickness [m] (for structural integrity)
    min_edge_thickness: float = 0.0005  # 0.5 mm


@dataclass
class LETEResult:
    """Result of LE/TE modification."""

    profile: BladeProfile  # Modified blade profile
    le_thickness: float  # Final LE thickness [m]
    te_thickness: float  # Final TE thickness [m]
    le_radius: float  # LE edge radius [m]
    te_radius: float  # TE edge radius [m]


def apply_lete_modification(
    profile: BladeProfile,
    spec: LETESpec,
) -> LETEResult:
    """Apply elliptical LE/TE modification to a blade profile.

    Replaces the default thickness distribution near the LE and TE
    with smooth elliptical shapes.

    Args:
        profile: Original blade profile with thickness.
        spec: LE/TE modification specification.

    Returns:
        LETEResult with modified profile and edge metrics.
    """
    n = len(profile.camber_points)
    if n < 4:
        return LETEResult(
            profile=profile,
            le_thickness=profile.thickness,
            te_thickness=profile.thickness,
            le_radius=0.0,
            te_radius=0.0,
        )

    max_thickness = profile.thickness
    new_ps: list[tuple[float, float]] = list(profile.pressure_side)
    new_ss: list[tuple[float, float]] = list(profile.suction_side)

    # Compute existing half-thickness at each point
    half_thicknesses = _extract_half_thicknesses(profile)

    # Modify LE region
    le_thick = max_thickness
    le_radius = 0.0
    if spec.le_enabled:
        le_n = max(2, int(spec.le_extent * n))
        new_ps, new_ss, le_thick, le_radius = _apply_elliptical_edge(
            profile.camber_points, new_ps, new_ss, half_thicknesses,
            edge="le", n_affected=le_n,
            elliptic_ratio=spec.le_elliptic_ratio,
            filing_ratio=spec.le_filing_ratio,
            min_thickness=spec.min_edge_thickness,
            max_thickness=max_thickness,
        )

    # Modify TE region
    te_thick = max_thickness
    te_radius = 0.0
    if spec.te_enabled:
        te_n = max(2, int(spec.te_extent * n))
        new_ps, new_ss, te_thick, te_radius = _apply_elliptical_edge(
            profile.camber_points, new_ps, new_ss, half_thicknesses,
            edge="te", n_affected=te_n,
            elliptic_ratio=spec.te_elliptic_ratio,
            filing_ratio=spec.te_filing_ratio,
            min_thickness=spec.min_edge_thickness,
            max_thickness=max_thickness,
        )

    modified = BladeProfile(
        camber_points=list(profile.camber_points),
        pressure_side=new_ps,
        suction_side=new_ss,
        thickness=max_thickness,
    )

    return LETEResult(
        profile=modified,
        le_thickness=le_thick,
        te_thickness=te_thick,
        le_radius=le_radius,
        te_radius=te_radius,
    )


def calc_edge_radius(
    thickness: float,
    elliptic_ratio: float,
) -> float:
    """Calculate the edge radius from thickness and elliptic ratio.

    For an ellipse with semi-axes a (along chord) and b (half-thickness):
        radius_of_curvature_at_tip = a² / b

    where a = elliptic_ratio * b.

    Args:
        thickness: Edge thickness (2*b) [m].
        elliptic_ratio: a/b ratio.

    Returns:
        Edge radius of curvature [m].
    """
    b = thickness / 2.0
    if b < 1e-8:
        return 0.0
    a = elliptic_ratio * b
    return a**2 / b


def _extract_half_thicknesses(profile: BladeProfile) -> list[float]:
    """Extract half-thickness at each camber point."""
    n = len(profile.camber_points)
    half_t: list[float] = []

    for i in range(n):
        r_c, theta_c = profile.camber_points[i]
        r_p, theta_p = profile.pressure_side[i]
        r_s, theta_s = profile.suction_side[i]

        # Half-thickness in angular terms, converted to meters
        dtheta = (theta_p - theta_s) / 2.0
        ht = abs(dtheta * r_c) if r_c > 1e-6 else 0.0
        half_t.append(ht)

    return half_t


def _apply_elliptical_edge(
    camber: list[tuple[float, float]],
    ps: list[tuple[float, float]],
    ss: list[tuple[float, float]],
    half_thicknesses: list[float],
    edge: str,
    n_affected: int,
    elliptic_ratio: float,
    filing_ratio: float,
    min_thickness: float,
    max_thickness: float,
) -> tuple[list[tuple[float, float]], list[tuple[float, float]], float, float]:
    """Apply elliptical modification to one edge.

    The elliptical thickness distribution near the edge is:
        t(s) = t_max * sqrt(1 - (s/s_extent)²)  (quarter-ellipse)

    where s is distance from the edge, normalized by the extent.

    Args:
        camber: Camber line points.
        ps: Pressure side points (mutable copy).
        ss: Suction side points (mutable copy).
        half_thicknesses: Current half-thickness at each point.
        edge: "le" or "te".
        n_affected: Number of points affected.
        elliptic_ratio: Ellipse semi-axis ratio.
        filing_ratio: Additional thinning factor.
        min_thickness: Minimum allowed thickness.
        max_thickness: Maximum blade thickness.

    Returns:
        (new_ps, new_ss, edge_thickness, edge_radius)
    """
    n = len(camber)
    new_ps = list(ps)
    new_ss = list(ss)

    if edge == "le":
        indices = range(n_affected)
        # Reference thickness: value at the end of the affected zone
        ref_ht = half_thicknesses[min(n_affected, n - 1)]
    else:
        indices = range(n - n_affected, n)
        ref_ht = half_thicknesses[max(0, n - n_affected - 1)]

    if ref_ht < 1e-8:
        ref_ht = max_thickness / 2.0

    edge_thickness = 0.0

    for idx in indices:
        # Normalized distance from edge: 0 at edge, 1 at boundary
        if edge == "le":
            s_norm = idx / max(n_affected - 1, 1)
        else:
            s_norm = (n - 1 - idx) / max(n_affected - 1, 1)

        # Elliptical thickness distribution
        # At edge (s_norm=0): thickness tapers to edge value
        # At boundary (s_norm=1): matches original thickness
        if s_norm >= 1.0:
            continue  # Don't modify beyond extent

        # Quarter-ellipse: t = ref_ht * sqrt(1 - (1-s)^2 * (1 - 1/ratio^2))
        # Simplified: blend from thin edge to full thickness
        s_eff = s_norm
        ellipse_factor = math.sqrt(
            1.0 - (1.0 - s_eff**2) * (1.0 - 1.0 / elliptic_ratio**2)
        ) if elliptic_ratio > 1.0 else s_eff

        # Filing reduces thickness further
        filing_factor = 1.0 - filing_ratio * (1.0 - s_norm)

        new_ht = ref_ht * ellipse_factor * filing_factor
        new_ht = max(new_ht, min_thickness / 2.0)

        # At the very edge point
        if idx == (0 if edge == "le" else n - 1):
            edge_thickness = new_ht * 2.0

        # Apply to PS and SS
        r_c, theta_c = camber[idx]
        if r_c > 1e-6:
            dtheta = new_ht / r_c
        else:
            dtheta = 0.0

        new_ps[idx] = (r_c, theta_c + dtheta)
        new_ss[idx] = (r_c, theta_c - dtheta)

    edge_radius = calc_edge_radius(edge_thickness, elliptic_ratio)

    return new_ps, new_ss, edge_thickness, edge_radius
