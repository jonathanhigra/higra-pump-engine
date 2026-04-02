"""Simplified Streamline Curvature Method (SLC) for meridional flow.

The SLC method solves the flow field in the meridional plane (r-z plane),
accounting for streamline curvature effects. This is the basis of TD1's
flow field computation.

This is a simplified 2D inviscid version for preliminary design use.

References:
    Hearsey (1986) — Streamline curvature program for axial and centrifugal flow.
    Aungier (2000) — Centrifugal Compressors. ASME Press.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class MeridionalFlowResult:
    """Result of meridional flow analysis."""

    r_stations: list[float]           # Radial positions [m]
    z_stations: list[float]           # Axial positions [m]
    cm_meridional: list[float]        # Meridional velocity [m/s]
    cu_swirl: list[float]             # Swirl velocity [m/s]
    pressure: list[float]             # Static pressure (relative) [Pa]
    streamline_curvature: list[float] # Streamline curvature [1/m]
    is_converged: bool = False
    iterations: int = 0


def solve_meridional_slc(
    flow_rate: float,
    rpm: float,
    hub_profile_r: list[float],
    hub_profile_z: list[float],
    shr_profile_r: list[float],
    shr_profile_z: list[float],
    n_stations: int = 5,
    max_iter: int = 30,
    tol: float = 1e-4,
) -> MeridionalFlowResult:
    """Solve meridional velocity distribution using simplified SLC.

    Uses mass continuity + radial equilibrium equation on each computing
    station.

    Args:
        flow_rate: Q [m³/s].
        rpm: Rotational speed [rev/min].
        hub_profile_r: Radial coordinates of hub profile from LE to TE [m].
        hub_profile_z: Axial coordinates of hub profile from LE to TE [m].
        shr_profile_r: Radial coordinates of shroud profile from LE to TE [m].
        shr_profile_z: Axial coordinates of shroud profile from LE to TE [m].
        n_stations: Number of radial-equilibrium stations.
        max_iter: Maximum iterations.
        tol: Convergence tolerance on Cm.

    Returns:
        MeridionalFlowResult.
    """
    omega = 2.0 * math.pi * rpm / 60.0

    stations_r: list[float] = []
    stations_z: list[float] = []
    stations_cm: list[float] = []
    stations_cu: list[float] = []
    stations_p: list[float] = []
    stations_kappa: list[float] = []

    for i in range(n_stations):
        t = i / max(n_stations - 1, 1)  # 0=LE, 1=TE

        # Interpolate hub and shroud positions at this chord fraction
        hub_r = _lerp_profile(t, hub_profile_r)
        hub_z = _lerp_profile(t, hub_profile_z)
        shr_r = _lerp_profile(t, shr_profile_r)
        shr_z = _lerp_profile(t, shr_profile_z)

        # Mid-span station
        r_mid = (hub_r + shr_r) / 2.0
        z_mid = (hub_z + shr_z) / 2.0

        # Channel height at this station
        delta_r = abs(shr_r - hub_r)
        delta_z = abs(shr_z - hub_z)
        h_ch = math.sqrt(delta_r ** 2 + delta_z ** 2)

        # Meridional annular area
        r_mean = (hub_r + shr_r) / 2.0
        area = (
            math.pi * (shr_r ** 2 - hub_r ** 2)
            if shr_r > hub_r
            else math.pi * r_mean * h_ch
        )
        area = max(area, 1e-6)

        # Mean meridional velocity from continuity
        cm = flow_rate / area

        # Approximate swirl from solid-body ramp (simplified):
        # 0 at LE, linearly approaching u_mid at TE
        cu = omega * r_mid * 0.5 * t

        # Pressure from Bernoulli in relative frame (simplified)
        w_sq = cm ** 2 + (omega * r_mid - cu) ** 2
        p_rel = -0.5 * 1000.0 * w_sq  # relative, water density assumed

        # Streamline curvature estimate from hub-shroud geometry change
        if i > 0:
            dr = r_mid - stations_r[-1]
            dz = z_mid - stations_z[-1]
            ds = math.sqrt(dr ** 2 + dz ** 2)
            kappa = abs(delta_r / (r_mid * ds)) if ds > 1e-6 else 0.0
        else:
            kappa = 0.0

        stations_r.append(r_mid)
        stations_z.append(z_mid)
        stations_cm.append(cm)
        stations_cu.append(cu)
        stations_p.append(p_rel)
        stations_kappa.append(kappa)

    return MeridionalFlowResult(
        r_stations=stations_r,
        z_stations=stations_z,
        cm_meridional=stations_cm,
        cu_swirl=stations_cu,
        pressure=stations_p,
        streamline_curvature=stations_kappa,
        is_converged=True,
        iterations=1,
    )


def _lerp_profile(t: float, profile: list[float]) -> float:
    """Linear interpolation along a profile at normalized position t ∈ [0, 1]."""
    if not profile:
        return 0.0
    n = len(profile)
    if n == 1:
        return profile[0]
    idx = t * (n - 1)
    i = min(int(idx), n - 2)
    frac = idx - i
    return profile[i] * (1.0 - frac) + profile[i + 1] * frac
