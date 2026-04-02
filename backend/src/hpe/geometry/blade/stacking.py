"""Blade stacking control: wrap angle, lean, bow, sweep (TD1-style).

Blade stacking defines the spatial relationship between blade sections at
different spans. Proper stacking controls secondary flows, end-wall losses,
and noise characteristics.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import math


@dataclass
class StackingConfig:
    """Blade stacking configuration."""
    # Pitchwise lean (tangential offset at shroud relative to hub) [deg]
    # Positive lean = toward pressure side (reduces tip loading)
    lean_angle_deg: float = 0.0

    # Axial sweep (axial shift of shroud LE relative to hub LE) [mm]
    # Positive sweep = aft sweep (reduces shock at high speed)
    sweep_mm: float = 0.0

    # Bow: pitchwise bow (S-shape lean, hub and shroud lean opposite)
    bow_enabled: bool = False
    bow_angle_deg: float = 0.0    # lean at hub (shroud is opposite)

    # Wrap angle: total circumferential blade wrap [deg]
    # Typical: 60–90° for centrifugal, 30–50° for mixed-flow
    wrap_angle_deg: float = 70.0

    # Stacking reference: where sections are aligned
    # 'le' = stack from LE, 'te' = stack from TE, 'cg' = centre of gravity
    stack_reference: str = 'le'


@dataclass
class StackingResult:
    """Result of blade stacking computation."""
    wrap_angle_deg: float
    lean_angle_deg: float
    sweep_mm: float
    # Pitchwise offsets at hub, mid, shroud (normalized to pitch at D2)
    pitchwise_offset_hub: float
    pitchwise_offset_mid: float
    pitchwise_offset_shr: float
    # Axial offsets [mm]
    axial_offset_hub_mm: float
    axial_offset_shr_mm: float
    # Secondary flow indicator (positive lean reduces hub overloading)
    lean_reduces_secondary_flow: bool
    warnings: list[str] = field(default_factory=list)


def compute_stacking(
    config: StackingConfig,
    d2: float,
    d1: float,
    blade_count: int,
    nq: float,
) -> StackingResult:
    """Compute blade stacking geometry parameters.

    Args:
        config: Stacking configuration
        d2: Outlet diameter [m]
        d1: Inlet diameter [m]
        blade_count: Number of blades
        nq: Specific speed (dimensionless Nq formula)
    """
    warnings = []

    # Pitch at outlet
    pitch_d2 = math.pi * d2 / blade_count

    # Pitchwise lean offsets (normalized to pitch)
    lean_rad = math.radians(config.lean_angle_deg)
    span = (d2 - d1) / 2  # approx radial span [m]
    lean_offset = span * math.tan(lean_rad) / pitch_d2  # at shroud rel. to hub

    pitchwise_hub = 0.0
    pitchwise_mid = lean_offset * 0.5
    pitchwise_shr = lean_offset

    if config.bow_enabled:
        bow_rad = math.radians(config.bow_angle_deg)
        bow_offset = span * math.tan(bow_rad) / pitch_d2
        # S-shaped: hub leans one way, shroud leans opposite
        pitchwise_hub = -bow_offset
        pitchwise_shr = +bow_offset
        pitchwise_mid = 0.0

    # Axial sweep
    axial_hub_mm = 0.0
    axial_shr_mm = config.sweep_mm

    # Wrap angle assessment
    wrap = config.wrap_angle_deg
    if nq < 20 and wrap < 50:
        warnings.append(f"Wrap angle {wrap:.0f}° may be too low for low Nq ({nq:.0f}) — typical ≥ 60°")
    if nq > 80 and wrap > 90:
        warnings.append(f"Wrap angle {wrap:.0f}° may be excessive for high Nq ({nq:.0f}) — consider ≤ 70°")
    if abs(config.lean_angle_deg) > 20:
        warnings.append(f"Lean angle {config.lean_angle_deg:.1f}° is large — verify secondary flow improvement")

    # Positive lean toward pressure side reduces hub overloading
    lean_reduces_secondary_flow = config.lean_angle_deg > 3.0

    return StackingResult(
        wrap_angle_deg=wrap,
        lean_angle_deg=config.lean_angle_deg,
        sweep_mm=config.sweep_mm,
        pitchwise_offset_hub=pitchwise_hub,
        pitchwise_offset_mid=pitchwise_mid,
        pitchwise_offset_shr=pitchwise_shr,
        axial_offset_hub_mm=axial_hub_mm,
        axial_offset_shr_mm=axial_shr_mm,
        lean_reduces_secondary_flow=lean_reduces_secondary_flow,
        warnings=warnings,
    )


def wrap_angle_from_geometry(
    d1: float,
    d2: float,
    beta1: float,
    beta2: float,
    blade_count: int,
) -> float:
    """Estimate blade wrap angle from inlet/outlet blade angles.

    Uses the logarithmic spiral approximation for the mean streamline.
    wrap = integral of dθ from inlet to outlet.

    For a logarithmic spiral: θ(r) = ln(r2/r1) / tan(β_mean)

    Args:
        d1: Inlet diameter [m]
        d2: Outlet diameter [m]
        beta1: Inlet blade angle [deg]
        beta2: Outlet blade angle [deg]
        blade_count: Number of blades

    Returns:
        Estimated wrap angle [deg]
    """
    r1 = d1 / 2
    r2 = d2 / 2
    beta_mean_rad = math.radians((beta1 + beta2) / 2)

    if r1 <= 0 or r2 <= 0 or math.tan(beta_mean_rad) <= 0:
        return 70.0  # fallback

    wrap_rad = math.log(r2 / r1) / math.tan(beta_mean_rad)
    return math.degrees(wrap_rad)
