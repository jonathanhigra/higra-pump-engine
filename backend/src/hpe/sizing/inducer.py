"""Inducer (axial inlet stage) sizing module.

An inducer is a low-specific-speed axial impeller mounted upstream of
the main centrifugal impeller to improve suction performance (NPSH).

References:
    Gülich (2014) §6.6 — Inducers and cavitation suppression.
    Stepanoff (1957) — Inducer geometry.
"""
from __future__ import annotations
import math
from dataclasses import dataclass


@dataclass
class InducerGeometry:
    """Geometry of an axial inducer."""
    d_tip: float        # Tip (outer) diameter [m]
    d_hub: float        # Hub diameter [m]
    hub_ratio: float    # d_hub / d_tip [-]
    pitch: float        # Axial pitch (blade spacing) [m]
    blade_count: int    # Number of inducer blades (usually 2-4)
    helix_angle: float  # Blade helix angle at tip [deg]
    length: float       # Axial length [m]
    npsh_improvement: float  # ΔNPSH improvement [m]
    sigma_i: float      # Inducer cavitation number [-]


def size_inducer(
    flow_rate: float,   # m³/s
    rpm: float,         # 1/min
    npsh_available: float,  # m
    d_impeller: float = 0.0,  # main impeller inlet diameter for reference
) -> InducerGeometry:
    """Size an axial inducer for improved suction performance.

    Uses Gülich (2014) §6.6 correlations.

    Args:
        flow_rate: Design flow rate [m³/s].
        rpm: Rotational speed [rpm].
        npsh_available: Available NPSH at pump inlet [m].
        d_impeller: Main impeller inlet diameter [m] (used to size inducer tip).

    Returns:
        InducerGeometry with preliminary dimensions.
    """
    omega = 2 * math.pi * rpm / 60.0

    # Tip diameter: slightly smaller than impeller inlet or computed from flow
    if d_impeller > 0:
        d_tip = d_impeller * 0.95
    else:
        # From flow coefficient: phi_tip ≈ 0.08-0.12 for good inducers
        phi_tip = 0.10
        d_tip = (4 * flow_rate / (math.pi * phi_tip * omega)) ** (1 / 3)

    hub_ratio = 0.30  # Typical for inducers
    d_hub = d_tip * hub_ratio

    r_tip = d_tip / 2
    u_tip = omega * r_tip

    # Flow coefficient at tip
    A_flow = math.pi / 4 * (d_tip**2 - d_hub**2)
    cm = flow_rate / A_flow if A_flow > 0 else 0.1

    # Helix angle at tip (typically 10-25° for good inducers)
    helix_angle = math.degrees(math.atan2(cm, u_tip))
    helix_angle = max(8.0, min(25.0, helix_angle))

    # Blade count: typically 2-4
    blade_count = 3 if helix_angle < 15 else 2

    # Axial length: 1-2 turns of helix
    pitch = math.pi * d_tip * math.tan(math.radians(helix_angle))
    length = pitch * 1.2  # slightly more than one pitch

    # NPSH improvement: Gülich Eq. 6.22
    # sigma_i ≈ 0.030-0.060 for good inducers
    sigma_i = 0.040
    npsh_inducer = sigma_i * u_tip**2 / (2 * 9.81)
    npsh_improvement = max(0.0, npsh_available * 0.3 - npsh_inducer)

    return InducerGeometry(
        d_tip=d_tip, d_hub=d_hub, hub_ratio=hub_ratio,
        pitch=pitch, blade_count=blade_count,
        helix_angle=helix_angle, length=length,
        npsh_improvement=npsh_improvement, sigma_i=sigma_i,
    )
