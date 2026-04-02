"""Geometry API routes — blade coordinates for 3D visualization."""

from __future__ import annotations

import math
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["geometry"])


class GeometryRequest(BaseModel):
    flow_rate: float = Field(..., gt=0)
    head: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    n_blade_points: int = Field(40, ge=10, le=100)


class BladePoint3D(BaseModel):
    x: float
    y: float
    z: float


class ImpellerGeometry(BaseModel):
    blades: List[List[BladePoint3D]]  # [blade_idx][point_idx]
    hub_profile: List[BladePoint3D]
    shroud_profile: List[BladePoint3D]
    blade_count: int
    d2: float
    d1: float
    b2: float


@router.post("/geometry/impeller", response_model=ImpellerGeometry)
def get_impeller_geometry(req: GeometryRequest) -> ImpellerGeometry:
    """Generate 3D blade coordinates for visualization.

    Returns (x, y, z) points for each blade, hub and shroud profiles
    suitable for Three.js rendering.
    """
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    op = OperatingPoint(flow_rate=req.flow_rate, head=req.head, rpm=req.rpm)
    sizing = run_sizing(op)

    mp = sizing.meridional_profile
    d1 = sizing.impeller_d1
    d2 = sizing.impeller_d2
    b2 = sizing.impeller_b2
    b1 = mp.get("b1", b2 * 1.2)
    r1 = d1 / 2.0
    r2 = d2 / 2.0
    n = req.n_blade_points

    beta1_rad = math.radians(sizing.beta1)
    beta2_rad = math.radians(sizing.beta2)

    # Generate one blade camber line in 3D
    def _blade_3d(angular_offset: float) -> list[BladePoint3D]:
        points: list[BladePoint3D] = []
        theta = 0.0
        dr = (r2 - r1) / (n - 1)

        for i in range(n):
            t = i / (n - 1)
            r = r1 + t * (r2 - r1)
            beta = beta1_rad + t * (beta2_rad - beta1_rad)

            # z: axial position (transitions from axial to radial)
            z_total = 0.8 * (r2 - r1)
            arc_t = math.pi / 2.0 * t
            z = z_total * (1.0 - math.sin(arc_t))

            angle = theta + angular_offset
            x = r * math.cos(angle) * 1000  # Convert to mm
            y = r * math.sin(angle) * 1000
            z_mm = z * 1000

            points.append(BladePoint3D(x=x, y=y, z=z_mm))

            if i < n - 1 and abs(math.tan(beta)) > 1e-10:
                dtheta = dr / (r * math.tan(beta))
                theta += dtheta

        return points

    # Generate all blades
    blades: list[list[BladePoint3D]] = []
    pitch = 2.0 * math.pi / sizing.blade_count
    for b in range(sizing.blade_count):
        blades.append(_blade_3d(b * pitch))

    # Hub profile (revolution, just a few points for the outline)
    hub_pts: list[BladePoint3D] = []
    r1_hub = mp.get("d1_hub", d1 * 0.35) / 2.0
    n_prof = 30
    for i in range(n_prof):
        t = i / (n_prof - 1)
        arc_t = math.pi / 2.0 * t
        z_total = 0.8 * (r2 - r1)
        r_hub = r1_hub + (r2 - r1_hub) * math.sin(arc_t)
        z_hub = z_total * (1.0 - math.sin(arc_t))
        hub_pts.append(BladePoint3D(x=r_hub * 1000, y=0, z=z_hub * 1000))

    # Shroud profile
    shroud_pts: list[BladePoint3D] = []
    for i in range(n_prof):
        t = i / (n_prof - 1)
        arc_t = math.pi / 2.0 * t
        z_total = 0.8 * (r2 - r1)
        r_sh = r1 + (r2 - r1) * math.sin(arc_t)
        b_local = b1 + t * (b2 - b1)
        z_sh = z_total * (1.0 - math.sin(arc_t)) + b_local
        shroud_pts.append(BladePoint3D(x=r_sh * 1000, y=0, z=z_sh * 1000))

    return ImpellerGeometry(
        blades=blades,
        hub_profile=hub_pts,
        shroud_profile=shroud_pts,
        blade_count=sizing.blade_count,
        d2=d2,
        d1=d1,
        b2=b2,
    )
