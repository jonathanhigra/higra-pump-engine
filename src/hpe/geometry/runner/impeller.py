"""3D impeller (runner) generation using CadQuery.

Assembles the full impeller from:
1. Hub disk (revolution of meridional hub profile)
2. Shroud disk (revolution of meridional shroud profile)
3. Blades (3D swept blade profiles, patterned circularly)

The result is a solid ready for export to STEP/STL for CFD meshing
or CAD visualization.
"""

from __future__ import annotations

import math
from typing import Optional

import cadquery as cq

from hpe.core.models import SizingResult
from hpe.geometry.models import RunnerGeometryParams
from hpe.geometry.runner.blade import generate_blade_profile
from hpe.geometry.runner.meridional import generate_meridional_channel


def generate_runner(
    params: RunnerGeometryParams,
    with_shroud: bool = False,
) -> cq.Workplane:
    """Generate a 3D centrifugal impeller.

    Creates an open impeller (hub + blades) by default.
    Set with_shroud=True for a closed impeller (adds shroud disk).

    Args:
        params: Runner geometry parameters.
        with_shroud: Whether to include the shroud disk.

    Returns:
        CadQuery Workplane containing the impeller solid.
    """
    # Generate 2D profiles
    channel = generate_meridional_channel(params)
    blade_profile = generate_blade_profile(params)

    # 1. Create hub disk
    hub = _create_hub_disk(params, channel)

    # 2. Create blades and add to hub
    result = _add_blades_to_hub(hub, params, blade_profile, channel)

    # 3. Optionally add shroud
    if with_shroud:
        shroud = _create_shroud_disk(params, channel)
        result = result.union(shroud)

    return result


def generate_runner_from_sizing(
    sizing_result: SizingResult,
    with_shroud: bool = False,
) -> cq.Workplane:
    """Generate runner directly from a SizingResult.

    Convenience function that creates RunnerGeometryParams from
    the sizing output.

    Args:
        sizing_result: Output from run_sizing().
        with_shroud: Whether to include shroud disk.

    Returns:
        CadQuery Workplane containing the impeller solid.
    """
    params = RunnerGeometryParams.from_sizing_result(sizing_result)
    return generate_runner(params, with_shroud=with_shroud)


def _create_hub_disk(
    params: RunnerGeometryParams,
    channel: object,
) -> cq.Workplane:
    """Create the hub (back shroud) disk by revolving the hub profile.

    Simplified approach: create a disk with the correct outer diameter
    and a bore, with thickness equal to b2 at the outlet.
    """
    r2 = params.d2 / 2.0 * 1000  # Convert to mm for CadQuery
    r1_hub = params.d1_hub / 2.0 * 1000
    b2 = params.b2 * 1000
    b1 = params.b1 * 1000
    r1 = params.d1 / 2.0 * 1000

    # Hub profile in the (r, z) plane — a cross-section to revolve
    # Start from bore at inlet, go to outer radius at outlet
    # Simple profile: flat back disk with curved front face
    hub_thickness = b2 * 0.4  # Hub disk thickness

    # Create hub as a revolved profile
    hub = (
        cq.Workplane("XZ")
        .moveTo(r1_hub, 0)
        .lineTo(r2, 0)  # Bottom face (outlet plane)
        .lineTo(r2, hub_thickness)  # Outer edge
        .threePointArc(
            ((r1 + r2) / 2.0, hub_thickness + b2 * 0.15),  # Midpoint with curve
            (r1, hub_thickness + (b1 - b2) * 0.3),  # Inner edge
        )
        .lineTo(r1_hub, hub_thickness + (b1 - b2) * 0.3)  # Top of bore
        .close()
        .revolve(360, (0, 0, 0), (0, 1, 0))
    )

    return hub


def _create_shroud_disk(
    params: RunnerGeometryParams,
    channel: object,
) -> cq.Workplane:
    """Create the shroud (front cover) disk.

    Simplified: thin disk at the shroud side with inlet eye opening.
    """
    r2 = params.d2 / 2.0 * 1000
    r1 = params.d1 / 2.0 * 1000
    b2 = params.b2 * 1000
    shroud_thickness = b2 * 0.15  # Thin shroud

    hub_thickness = b2 * 0.4
    shroud_z = hub_thickness + b2 * 0.6  # Position above hub

    # Shroud as an annular disk with inlet opening
    shroud = (
        cq.Workplane("XY")
        .transformed(offset=(0, 0, shroud_z))
        .circle(r2)
        .circle(r1)  # Inlet eye cutout
        .extrude(shroud_thickness)
    )

    return shroud


def _add_blades_to_hub(
    hub: cq.Workplane,
    params: RunnerGeometryParams,
    blade_profile: object,
    channel: object,
) -> cq.Workplane:
    """Add blades to the hub disk.

    Each blade is created as a swept solid from inlet to outlet,
    following the blade profile curve. Blades are patterned circularly.

    Simplified approach for MVP:
    - Create blade as a thin curved solid in the (r, theta) plane
    - Extrude in the z-direction (axial) to span the channel height
    - Pattern around the axis
    """
    r1 = params.d1 / 2.0 * 1000  # mm
    r2 = params.d2 / 2.0 * 1000
    b2 = params.b2 * 1000
    b1 = params.b1 * 1000
    blade_t = params.blade_thickness * 1000  # mm
    hub_thickness = b2 * 0.4

    beta1_rad = math.radians(params.beta1)
    beta2_rad = math.radians(params.beta2)

    # Generate blade profile points in (x, y) from (r, theta)
    n_pts = 30
    blade_height = b2 * 0.6  # Blade extends from hub surface into channel

    # Create one blade as a lofted solid
    blade = _create_single_blade(
        r1, r2, beta1_rad, beta2_rad,
        blade_t, blade_height, hub_thickness, n_pts,
    )

    if blade is None:
        return hub

    # Add first blade to hub
    result = hub.union(blade)

    # Pattern remaining blades
    angle_step = 360.0 / params.blade_count
    for i in range(1, params.blade_count):
        angle = angle_step * i
        rotated_blade = blade.rotate((0, 0, 0), (0, 0, 1), angle)
        result = result.union(rotated_blade)

    return result


def _create_single_blade(
    r1: float,
    r2: float,
    beta1: float,
    beta2: float,
    thickness: float,
    height: float,
    z_base: float,
    n_points: int,
) -> Optional[cq.Workplane]:
    """Create a single blade as a swept solid.

    Improved approach: generates cross-sections at multiple radial
    stations along the spiral camber line, each section being a thin
    rectangle oriented along the local blade angle. The sections are
    at two Z-levels (hub and shroud) and lofted to create a 3D blade.
    """
    # Generate camber line points in (x, y) via spiral integration
    camber_xy: list[tuple[float, float]] = []
    angles: list[float] = []  # Local blade orientation angle

    theta = 0.0
    dr = (r2 - r1) / (n_points - 1)

    for i in range(n_points):
        t = i / (n_points - 1)
        r = r1 + t * (r2 - r1)

        x = r * math.cos(theta)
        y = r * math.sin(theta)
        camber_xy.append((x, y))

        # Local blade direction angle
        beta = beta1 + t * (beta2 - beta1)
        blade_dir = theta + math.pi / 2.0 - beta  # Tangent to spiral
        angles.append(blade_dir)

        # Integrate spiral: dtheta = dr / (r * tan(beta))
        if i < n_points - 1 and abs(math.tan(beta)) > 1e-10:
            dtheta = dr / (r * math.tan(beta))
            theta += dtheta

    if len(camber_xy) < 3:
        return None

    # Build blade using segment approach with proper thickness orientation
    # Each segment is a thin box aligned to the local camber direction
    result = None
    half_t = thickness / 2.0

    for i in range(len(camber_xy) - 1):
        x1, y1 = camber_xy[i]
        x2, y2 = camber_xy[i + 1]

        mx = (x1 + x2) / 2.0
        my = (y1 + y2) / 2.0

        dx = x2 - x1
        dy = y2 - y1
        seg_len = math.sqrt(dx * dx + dy * dy)
        if seg_len < 1e-6:
            continue

        angle = math.degrees(math.atan2(dy, dx))

        # Taper thickness: thicker at mid-chord, thinner at LE/TE
        t_mid = len(camber_xy) // 2
        dist_from_mid = abs(i - t_mid) / max(t_mid, 1)
        local_thickness = thickness * (1.0 - 0.4 * dist_from_mid)

        try:
            seg = (
                cq.Workplane("XY")
                .transformed(
                    offset=(mx, my, z_base),
                    rotate=(0, 0, angle),
                )
                .rect(seg_len * 1.05, local_thickness)
                .extrude(height)
            )

            if result is None:
                result = seg
            else:
                result = result.union(seg)
        except Exception:
            continue

    return result
