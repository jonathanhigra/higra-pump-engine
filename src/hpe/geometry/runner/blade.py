"""Blade profile generation for centrifugal impellers.

Generates the 2D blade camber line in the (r, theta) plane and applies
thickness to create pressure and suction side profiles.

The blade wraps from inlet (r1, theta=0) to outlet (r2, theta_wrap),
where the wrap angle depends on blade angles beta1 and beta2.

For a logarithmic spiral blade:
    dr/dtheta = r * tan(beta)

where beta varies from beta1 (inlet) to beta2 (outlet).
"""

from __future__ import annotations

import math

from hpe.geometry.models import BladeProfile, RunnerGeometryParams


def generate_blade_profile(
    params: RunnerGeometryParams,
    n_points: int = 50,
) -> BladeProfile:
    """Generate a single blade profile (camber + thickness).

    Uses linear interpolation of blade angle from beta1 to beta2
    and integrates the spiral equation to get the camber line.

    Args:
        params: Runner geometry parameters.
        n_points: Number of points along the blade.

    Returns:
        BladeProfile with camber, pressure side, and suction side.
    """
    r1 = params.d1 / 2.0
    r2 = params.d2 / 2.0
    beta1_rad = math.radians(params.beta1)
    beta2_rad = math.radians(params.beta2)

    # Generate camber line by integrating dtheta = dr / (r * tan(beta))
    camber_points = _generate_camber_line(
        r1, r2, beta1_rad, beta2_rad, n_points,
    )

    # Apply thickness
    thickness = params.blade_thickness
    pressure_side, suction_side = _apply_thickness(
        camber_points, thickness,
    )

    return BladeProfile(
        camber_points=camber_points,
        pressure_side=pressure_side,
        suction_side=suction_side,
        thickness=thickness,
    )


def _generate_camber_line(
    r1: float,
    r2: float,
    beta1: float,
    beta2: float,
    n_points: int,
) -> list[tuple[float, float]]:
    """Generate blade camber line in (r, theta) coordinates.

    Integrates the spiral equation:
        dtheta/dr = 1 / (r * tan(beta(r)))

    where beta(r) is linearly interpolated from beta1 to beta2.

    Args:
        r1: Inlet radius [m].
        r2: Outlet radius [m].
        beta1: Inlet blade angle [rad].
        beta2: Outlet blade angle [rad].
        n_points: Number of discretization points.

    Returns:
        List of (r, theta) tuples. theta=0 at inlet.
    """
    points: list[tuple[float, float]] = []
    dr = (r2 - r1) / (n_points - 1)

    theta = 0.0
    for i in range(n_points):
        t = i / (n_points - 1)  # 0 to 1
        r = r1 + t * (r2 - r1)

        points.append((r, theta))

        # Interpolate beta at this radius
        beta = beta1 + t * (beta2 - beta1)

        # Integrate: dtheta = dr / (r * tan(beta))
        if i < n_points - 1 and abs(math.tan(beta)) > 1e-10:
            dtheta = dr / (r * math.tan(beta))
            theta += dtheta

    return points


def _apply_thickness(
    camber_points: list[tuple[float, float]],
    max_thickness: float,
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """Apply thickness distribution to the camber line.

    Uses a NACA-style thickness distribution: thick in the middle,
    thin at leading and trailing edges.

    t(s) = max_thickness * 4 * s * (1 - s)  (parabolic, max at midchord)

    The offset is applied normal to the camber line in the (r, theta) plane.

    Args:
        camber_points: List of (r, theta) points on the camber line.
        max_thickness: Maximum blade thickness [m].

    Returns:
        Tuple of (pressure_side, suction_side) point lists.
    """
    n = len(camber_points)
    pressure_side: list[tuple[float, float]] = []
    suction_side: list[tuple[float, float]] = []

    for i in range(n):
        r, theta = camber_points[i]
        s = i / max(n - 1, 1)  # Normalized arc length 0..1

        # Parabolic thickness distribution (0 at LE/TE, max at mid)
        half_t = max_thickness / 2.0 * 4.0 * s * (1.0 - s)

        # Convert thickness to angular offset: dtheta = t / (2 * r)
        if r > 1e-6:
            dtheta = half_t / r
        else:
            dtheta = 0.0

        pressure_side.append((r, theta + dtheta))
        suction_side.append((r, theta - dtheta))

    return pressure_side, suction_side


def calc_wrap_angle(profile: BladeProfile) -> float:
    """Calculate total wrap angle of the blade [degrees].

    Args:
        profile: BladeProfile.

    Returns:
        Wrap angle in degrees (theta at outlet - theta at inlet).
    """
    if not profile.camber_points:
        return 0.0
    theta_in = profile.camber_points[0][1]
    theta_out = profile.camber_points[-1][1]
    return math.degrees(abs(theta_out - theta_in))
