"""Simplified structural stress prediction for impeller blades.

Estimates centrifugal and bending stresses on impeller blades
without full FEA, providing quick screening of structural feasibility
during the design phase.

Stress components:
1. Centrifugal stress — from blade mass rotating at speed ω
2. Bending stress — from fluid pressure loading on the blade
3. Combined stress — von Mises equivalent

These simplified models match the preliminary stress estimation
capability of ADT TURBOdesign1.

References:
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed., Ch. 14.
    - Japikse, D. (1996). Centrifugal Compressor Design and
      Performance, Ch. 8.
    - Bohl, W. (2005). Strömungsmaschinen, stress analysis sections.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from hpe.core.models import G, SizingResult


@dataclass
class MaterialProperties:
    """Material properties for structural analysis."""

    name: str = "Stainless Steel 316L"
    density: float = 7980.0  # [kg/m³]
    yield_strength: float = 205e6  # [Pa]
    ultimate_strength: float = 515e6  # [Pa]
    elastic_modulus: float = 193e9  # [Pa]
    poisson_ratio: float = 0.27
    fatigue_limit: float = 120e6  # [Pa] (endurance limit at 10^7 cycles)


# Common impeller materials
CAST_IRON = MaterialProperties(
    name="Cast Iron GG-25",
    density=7200, yield_strength=165e6, ultimate_strength=250e6,
    elastic_modulus=110e9, poisson_ratio=0.26, fatigue_limit=80e6,
)
BRONZE = MaterialProperties(
    name="Bronze CuSn10",
    density=8800, yield_strength=130e6, ultimate_strength=280e6,
    elastic_modulus=110e9, poisson_ratio=0.34, fatigue_limit=70e6,
)
STAINLESS_316L = MaterialProperties()
DUPLEX_2205 = MaterialProperties(
    name="Duplex SS 2205",
    density=7800, yield_strength=450e6, ultimate_strength=620e6,
    elastic_modulus=200e9, poisson_ratio=0.30, fatigue_limit=250e6,
)


@dataclass
class StressResult:
    """Stress analysis result for an impeller."""

    # Centrifugal stress [Pa]
    centrifugal_stress_root: float  # At blade root (hub junction)
    centrifugal_stress_tip: float  # At blade tip

    # Bending stress [Pa]
    bending_stress_le: float  # At leading edge root
    bending_stress_te: float  # At trailing edge root
    bending_stress_max: float  # Maximum bending anywhere

    # Combined
    von_mises_max: float  # Maximum von Mises equivalent stress

    # Safety factors
    sf_yield: float  # Yield safety factor
    sf_fatigue: float  # Fatigue safety factor
    sf_ultimate: float  # Ultimate safety factor

    # Blade natural frequency estimate
    first_natural_freq: float  # [Hz]
    campbell_margin: float  # Margin from blade passing frequency

    # Assessment
    is_safe: bool
    warnings: list[str]


def calc_centrifugal_stress(
    d1: float,
    d2: float,
    b2: float,
    blade_thickness: float,
    blade_count: int,
    rpm: float,
    material: MaterialProperties = STAINLESS_316L,
) -> tuple[float, float]:
    """Calculate centrifugal stress on the blade.

    The blade experiences centrifugal force F = m * ω² * r_cg
    where r_cg is the radial position of the blade center of gravity.

    Stress at root = F / A_root

    For a blade element at radius r with thickness t and width b:
        dF = ρ_m * t * b * ω² * r * dr

    Integrated from r1 to r2:
        σ_centrifugal = ρ_m * ω² * (r2² - r1²) / 2

    This is independent of blade thickness (stress = force/area,
    and both scale with thickness).

    Args:
        d1: Inlet diameter [m].
        d2: Outlet diameter [m].
        b2: Blade height at outlet [m].
        blade_thickness: Blade thickness [m].
        blade_count: Number of blades.
        rpm: Rotational speed [rev/min].
        material: Material properties.

    Returns:
        (stress_root, stress_tip) in Pa.
    """
    omega = 2.0 * math.pi * rpm / 60.0
    r1 = d1 / 2.0
    r2 = d2 / 2.0

    # Root stress: from blade mass between r1 and r2
    # σ_root = ρ * ω² * (r2² - r1²) / 2
    sigma_root = material.density * omega**2 * (r2**2 - r1**2) / 2.0

    # Tip stress (at outlet): only local mass contribution
    # Much lower than root — approximate as fraction
    sigma_tip = material.density * omega**2 * r2**2 * 0.1

    return sigma_root, sigma_tip


def calc_bending_stress(
    d1: float,
    d2: float,
    b2: float,
    blade_thickness: float,
    blade_count: int,
    rpm: float,
    head: float,
    flow_rate: float,
    rho_fluid: float = 998.2,
) -> tuple[float, float, float]:
    """Calculate bending stress from fluid pressure loading.

    The blade is loaded by the pressure difference between pressure
    and suction sides. This creates a bending moment about the root.

    Simplified model: blade as a cantilever beam, loaded by
    distributed pressure Δp = ρ * g * H / Z  (per blade).

    Bending stress at root:
        σ_b = M / W = (Δp * L² / 2) / (t² / 6)

    where L is blade height (b2), t is blade thickness.

    Args:
        d1: Inlet diameter [m].
        d2: Outlet diameter [m].
        b2: Blade height [m].
        blade_thickness: Blade thickness [m].
        blade_count: Number of blades.
        rpm: Rotational speed [rev/min].
        head: Pump head [m].
        flow_rate: Flow rate [m³/s].
        rho_fluid: Fluid density [kg/m³].

    Returns:
        (bending_le, bending_te, bending_max) in Pa.
    """
    # Pressure rise per blade passage
    delta_p = rho_fluid * G * head / blade_count

    # Blade chord length (approximate)
    r1 = d1 / 2.0
    r2 = d2 / 2.0
    chord = math.sqrt((r2 - r1) ** 2 + (math.pi * (r1 + r2) / blade_count) ** 2)

    # Section modulus of blade cross-section (rectangular)
    # W = t² * chord / 6 (for bending about the thin direction)
    t = blade_thickness
    section_modulus = t**2 / 6.0  # Per unit chord [m²]

    # Bending moment at root (cantilever with distributed load)
    # M = Δp * b2 * chord * (b2 / 2) — pressure * area * moment arm
    # Distributed: q = Δp * chord, M_root = q * b2² / 2
    q = delta_p * chord  # Force per unit height [N/m]
    moment_root = q * b2**2 / 2.0  # [N·m]

    # Stress at root
    sigma_root = moment_root / (section_modulus * chord)

    # LE: higher loading at inlet (incidence effects)
    sigma_le = sigma_root * 1.2

    # TE: lower loading at outlet
    sigma_te = sigma_root * 0.8

    sigma_max = max(sigma_le, sigma_te)

    return sigma_le, sigma_te, sigma_max


def calc_blade_natural_frequency(
    d1: float,
    d2: float,
    b2: float,
    blade_thickness: float,
    material: MaterialProperties = STAINLESS_316L,
) -> float:
    """Estimate first natural frequency of blade (simplified cantilever).

    f1 = (1.875²) / (2π * L²) * sqrt(E * I / (ρ * A))

    where L = blade height (b2), I = moment of inertia of cross-section.

    Args:
        d1: Inlet diameter [m].
        d2: Outlet diameter [m].
        b2: Blade height [m].
        blade_thickness: Blade thickness [m].
        material: Material properties.

    Returns:
        First natural frequency [Hz].
    """
    r1 = d1 / 2.0
    r2 = d2 / 2.0
    chord = math.sqrt((r2 - r1) ** 2 + (math.pi * (r1 + r2) / 7) ** 2)

    t = blade_thickness
    # Moment of inertia of rectangular section
    i_section = chord * t**3 / 12.0  # [m⁴]
    a_section = chord * t  # [m²]

    # Cantilever first mode
    lambda1 = 1.875  # First eigenvalue for clamped-free beam
    l_blade = b2

    if l_blade < 1e-6 or a_section < 1e-15:
        return 0.0

    f1 = (lambda1**2 / (2.0 * math.pi * l_blade**2)) * math.sqrt(
        material.elastic_modulus * i_section / (material.density * a_section)
    )

    return f1


def calc_abladek3(
    blade_count: int,
    d2: float,
    b2: float,
    blade_thickness: float = 0.004,
    hub_ratio: float = 0.35,
) -> float:
    """Blade stress geometric factor ABladek3 (TURBOdesign1 equivalent).

    This factor accounts for the blade geometry effect on bending stress.
    Proportional to blade area and inversely to section modulus.

    ABladek3 = (π*D2*b2) / (Z * t² / 6)  [simplified section factor]

    Returns:
        Geometric stress factor [1/m²].
    """
    if blade_count <= 0 or blade_thickness < 1e-6:
        return 0.0

    blade_area = math.pi * d2 * b2 / blade_count  # Per blade [m²]
    section_modulus = blade_thickness**2 / 6  # [m²] rectangular section

    abladek3 = blade_area / section_modulus if section_modulus > 0 else 0.0
    return round(abladek3, 3)


def analyze_stress(
    sizing: SizingResult,
    rpm: float,
    head: float,
    flow_rate: float,
    blade_thickness: float = 0.004,
    tip_clearance: float = 0.5e-3,
    material: MaterialProperties = STAINLESS_316L,
    rho_fluid: float = 998.2,
) -> StressResult:
    """Perform complete stress analysis on impeller blades.

    Combines centrifugal, bending, and dynamic analysis to assess
    structural integrity with safety factors.

    Args:
        sizing: SizingResult from 1D sizing.
        rpm: Rotational speed [rev/min].
        head: Design head [m].
        flow_rate: Design flow rate [m³/s].
        blade_thickness: Blade thickness [m].
        material: Material properties.
        rho_fluid: Fluid density [kg/m³].

    Returns:
        StressResult with all stress components and safety assessment.
    """
    d1 = sizing.impeller_d1
    d2 = sizing.impeller_d2
    b2 = sizing.impeller_b2
    z = sizing.blade_count

    warnings: list[str] = []

    # Centrifugal stress
    sigma_c_root, sigma_c_tip = calc_centrifugal_stress(
        d1, d2, b2, blade_thickness, z, rpm, material,
    )

    # Bending stress
    sigma_b_le, sigma_b_te, sigma_b_max = calc_bending_stress(
        d1, d2, b2, blade_thickness, z, rpm, head, flow_rate, rho_fluid,
    )

    # Von Mises combined stress (σ_c and σ_b are roughly orthogonal)
    # σ_vm = sqrt(σ_c² + σ_b² - σ_c * σ_b + 3τ²)
    # Simplified: assume σ_c and σ_b are principal stresses
    sigma_vm = math.sqrt(
        sigma_c_root**2 + sigma_b_max**2 - sigma_c_root * sigma_b_max
    )

    # Safety factors
    sf_yield = material.yield_strength / sigma_vm if sigma_vm > 0 else float("inf")
    sf_fatigue = material.fatigue_limit / sigma_vm if sigma_vm > 0 else float("inf")
    sf_ultimate = material.ultimate_strength / sigma_vm if sigma_vm > 0 else float("inf")

    # Natural frequency
    f1 = calc_blade_natural_frequency(d1, d2, b2, blade_thickness, material)

    # Blade passing frequency
    bpf = z * rpm / 60.0  # [Hz]

    # Campbell margin (avoid resonance)
    campbell_margin = abs(f1 - bpf) / bpf if bpf > 0 else float("inf")

    # Warnings
    if sf_yield < 1.5:
        warnings.append(
            f"Low yield safety factor: {sf_yield:.2f} (min recommended: 1.5)"
        )
    if sf_yield < 1.0:
        warnings.append("CRITICAL: Stress exceeds yield strength!")

    if sf_fatigue < 2.0:
        warnings.append(
            f"Low fatigue safety factor: {sf_fatigue:.2f} (min recommended: 2.0)"
        )

    if campbell_margin < 0.15:
        warnings.append(
            f"Blade natural frequency ({f1:.0f} Hz) is close to BPF ({bpf:.0f} Hz). "
            f"Campbell margin: {campbell_margin:.1%}. Risk of resonance."
        )

    u2 = math.pi * d2 * rpm / 60.0
    if u2 > 60.0:
        warnings.append(
            f"High tip speed u2={u2:.1f} m/s. Check erosion and fatigue life."
        )

    is_safe = sf_yield >= 1.5 and sf_fatigue >= 2.0 and campbell_margin >= 0.10

    return StressResult(
        centrifugal_stress_root=sigma_c_root,
        centrifugal_stress_tip=sigma_c_tip,
        bending_stress_le=sigma_b_le,
        bending_stress_te=sigma_b_te,
        bending_stress_max=sigma_b_max,
        von_mises_max=sigma_vm,
        sf_yield=sf_yield,
        sf_fatigue=sf_fatigue,
        sf_ultimate=sf_ultimate,
        first_natural_freq=f1,
        campbell_margin=campbell_margin,
        is_safe=is_safe,
        warnings=warnings,
    )
