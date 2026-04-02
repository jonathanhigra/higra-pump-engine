"""Meridional channel profile generation for centrifugal impellers.

The meridional channel is the 2D cross-section of the impeller in the
(r, z) plane, defined by hub and shroud curves. For a centrifugal pump,
the flow enters axially and exits radially, so the channel curves from
the axial to the radial direction.

Convention:
    - r: radial coordinate [m] (0 = centerline)
    - z: axial coordinate [m] (0 = outlet plane, positive = upstream/inlet)
    - Points ordered from inlet to outlet
"""

from __future__ import annotations

import math

from hpe.geometry.models import MeridionalChannel, RunnerGeometryParams


def generate_meridional_channel(
    params: RunnerGeometryParams,
    n_points: int = 30,
) -> MeridionalChannel:
    """Generate meridional channel (hub and shroud curves).

    For a centrifugal pump, the channel transitions from axial inlet
    to radial outlet. We use a circular arc to create a smooth bend.

    The axial length is auto-calculated if not provided:
        L_axial ~ 0.8 * (D2 - D1) / 2

    Args:
        params: Runner geometry parameters.
        n_points: Number of points along each curve.

    Returns:
        MeridionalChannel with hub and shroud point lists.
    """
    r1 = params.d1 / 2.0  # Inlet radius (shroud)
    r1_hub = params.d1_hub / 2.0  # Inlet radius (hub)
    r2 = params.d2 / 2.0  # Outlet radius

    # Axial length of the impeller
    if params.axial_length is not None:
        z_total = params.axial_length
    else:
        z_total = 0.8 * (r2 - r1)

    # Outlet widths
    b2 = params.b2
    b1 = params.b1

    # Generate shroud curve (outer wall of channel)
    shroud_points = _generate_channel_curve(
        r_inlet=r1,
        r_outlet=r2,
        z_inlet=z_total,
        z_outlet=b2 / 2.0,  # Shroud at +b2/2 from midplane at outlet
        n_points=n_points,
    )

    # Generate hub curve (inner wall of channel)
    hub_points = _generate_channel_curve(
        r_inlet=r1_hub,
        r_outlet=r2,
        z_inlet=z_total,
        z_outlet=-b2 / 2.0,  # Hub at -b2/2 from midplane at outlet
        n_points=n_points,
    )

    return MeridionalChannel(
        hub_points=hub_points,
        shroud_points=shroud_points,
    )


def _generate_channel_curve(
    r_inlet: float,
    r_outlet: float,
    z_inlet: float,
    z_outlet: float,
    n_points: int,
) -> list[tuple[float, float]]:
    """Generate a smooth curve from inlet to outlet using an elliptical arc.

    The curve transitions smoothly from the axial direction (at inlet)
    to the radial direction (at outlet).

    Args:
        r_inlet: Radial position at inlet [m].
        r_outlet: Radial position at outlet [m].
        z_inlet: Axial position at inlet [m].
        z_outlet: Axial position at outlet [m].
        n_points: Number of points along the curve.

    Returns:
        List of (r, z) tuples from inlet to outlet.
    """
    points: list[tuple[float, float]] = []

    # Use parametric elliptical arc:
    # At t=0: point is at inlet (r_inlet, z_inlet)
    # At t=pi/2: point is at outlet (r_outlet, z_outlet)
    #
    # r(t) = r_inlet + (r_outlet - r_inlet) * sin(t)
    # z(t) = z_inlet + (z_outlet - z_inlet) * (1 - cos(t))

    dr = r_outlet - r_inlet
    dz = z_outlet - z_inlet

    for i in range(n_points):
        t = (math.pi / 2.0) * i / (n_points - 1)

        r = r_inlet + dr * math.sin(t)
        z = z_inlet + dz * (1.0 - math.cos(t))

        points.append((r, z))

    return points


def calc_channel_width(
    channel: MeridionalChannel,
    index: int,
) -> float:
    """Calculate the channel width at a given station index.

    The width is the distance between hub and shroud points
    at the same index (approximately normal to the flow).

    Args:
        channel: MeridionalChannel.
        index: Point index (0 = inlet, -1 = outlet).

    Returns:
        Channel width [m].
    """
    rh, zh = channel.hub_points[index]
    rs, zs = channel.shroud_points[index]
    return math.sqrt((rs - rh) ** 2 + (zs - zh) ** 2)
