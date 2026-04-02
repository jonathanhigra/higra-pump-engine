"""Volute 2D flow solver — performance prediction.

Computes total head loss, static pressure recovery coefficient, and
throat area for a volute casing, given geometry parameters.

Implements the method from:
    Gülich (2014) §7.5 — Volute casing hydraulics.
    Eck (1973) — Fans: Design and Operation.

Supports cross-section types:
    SEMICIRCLE — circular cross-section (area = π*R²/2)
    ELLIPSE    — elliptical cross-section (area = π*a*b/2)
    RECTANGLE  — rectangular cross-section (area = width × height)
    TRAPEZOID  — trapezoidal cross-section

Volute types:
    single_radial   — standard single radial discharge
    single_tangential — tangential discharge
    double          — double volute (two parallel spirals)
    semi_double     — semi-double (split volute)
    asymmetric_ext  — asymmetric extended
    double_entry    — double inlet volute
    axial_entry     — axial inlet to radial discharge
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from enum import Enum


class CrossSectionType(str, Enum):
    SEMICIRCLE = "SEMICIRCLE"
    ELLIPSE = "ELLIPSE"
    RECTANGLE = "RECTANGLE"
    TRAPEZOID = "TRAPEZOID"


class VoluteType(str, Enum):
    SINGLE_RADIAL = "single_radial"
    SINGLE_TANGENTIAL = "single_tangential"
    DOUBLE = "double"
    SEMI_DOUBLE = "semi_double"
    ASYMMETRIC_EXT = "asymmetric_ext"
    DOUBLE_ENTRY = "double_entry"
    AXIAL_ENTRY = "axial_entry"


@dataclass
class VoluteGeometry:
    """Volute casing geometry parameters."""
    r2: float                               # Impeller outlet radius [m]
    b2: float                               # Impeller outlet width [m]
    r3: float                               # Cutwater (tongue) radius [m]
    section_type: CrossSectionType = CrossSectionType.SEMICIRCLE
    volute_type: VoluteType = VoluteType.SINGLE_RADIAL
    # Cross-section parameters:
    semi_major: float = 0.0                # Ellipse major axis [m]
    semi_minor: float = 0.0                # Ellipse minor axis [m]
    rect_width: float = 0.0                # Rectangle width [m]
    rect_height: float = 0.0              # Rectangle height [m]
    # Tongue parameters:
    tongue_radius: float = 0.002           # Tongue fillet radius [m]
    tube_length: float = 0.2              # Discharge tube length [m]
    tube_diameter: float = 0.08           # Discharge tube diameter [m]
    tube_angle_deg: float = 0.0           # Discharge tube angle [deg]
    # Fluid:
    rho: float = 998.0


@dataclass
class VoluteSolverResult:
    """Volute flow solver output."""
    total_head_loss_m: float        # Total head loss [m]
    static_pressure_recovery: float # Cp = (p4-p3)/(0.5*rho*c3²) [-]
    throat_area_m2: float           # Throat (cutwater) area [m²]
    scroll_exit_area_m2: float      # Area at end of 360° scroll [m²]
    mean_velocity_ms: float         # Mean velocity in volute [m/s]
    discharge_velocity_ms: float    # Velocity at discharge tube [m/s]
    loss_coefficient: float         # Total loss coefficient ζ = ΔH/(c3²/2g)
    sections: list[dict] = field(default_factory=list)  # 8 angular sections (0→315°)


def solve_volute(
    volute: VoluteGeometry,
    flow_rate: float,
    head: float,
    rpm: float,
) -> VoluteSolverResult:
    """Solve volute flow and compute performance.

    Uses Gülich (2014) §7.5 method:
    1. Determine throat area from flow continuity
    2. Compute velocity distribution around scroll
    3. Calculate total head loss from friction + mixing + tongue losses
    4. Compute static pressure recovery coefficient

    Args:
        volute: VoluteGeometry parameters.
        flow_rate: Q [m³/s].
        head: H [m].
        rpm: RPM.

    Returns:
        VoluteSolverResult.
    """
    G = 9.81
    rho = volute.rho

    # Double volute: each half carries Q/2
    q_volute = flow_rate / 2 if volute.volute_type == VoluteType.DOUBLE else flow_rate

    # Reference velocity (tangential at impeller outlet)
    omega = 2 * math.pi * rpm / 60.0
    u2 = omega * volute.r2

    # Cutwater (throat) velocity: c3 = Q / A_throat
    # A_throat from continuity: A_throat = Q / (k_throat * u2)
    # k_throat ≈ 0.8 for standard designs (Gülich)
    k_throat = 0.80
    c3_ref = k_throat * u2
    A_throat = q_volute / c3_ref if c3_ref > 1e-9 else 0.001

    # Scroll exit area (at 360°) ≈ 1.2 × throat area
    A_exit = A_throat * 1.20

    # Cross-section geometry
    if volute.section_type == CrossSectionType.SEMICIRCLE:
        R_sc = math.sqrt(2 * A_throat / math.pi)
        hydraulic_d = 4 * A_throat / (math.pi * R_sc + 2 * R_sc)
    elif volute.section_type == CrossSectionType.ELLIPSE:
        a = volute.semi_major if volute.semi_major > 0 else math.sqrt(A_throat / math.pi * 2)
        b = volute.semi_minor if volute.semi_minor > 0 else a * 0.6
        hydraulic_d = 4 * math.pi * a * b / (2 * math.pi * (a + b))
    elif volute.section_type == CrossSectionType.RECTANGLE:
        w = volute.rect_width if volute.rect_width > 0 else math.sqrt(A_throat * 1.5)
        h_r = volute.rect_height if volute.rect_height > 0 else A_throat / w
        hydraulic_d = 4 * w * h_r / (2 * (w + h_r))
    else:
        hydraulic_d = 2 * math.sqrt(A_throat / math.pi)

    # Mean scroll velocity
    c_scroll = q_volute / A_throat if A_throat > 1e-9 else 0.0

    # Discharge tube velocity
    A_tube = math.pi * volute.tube_diameter**2 / 4 if volute.tube_diameter > 0 else A_throat
    c_discharge = flow_rate / A_tube if A_tube > 1e-9 else 0.0

    # Losses (Gülich 2014):
    # 1. Friction loss in scroll
    lambda_f = 0.025  # Darcy friction factor
    L_scroll = math.pi * (volute.r3 + math.sqrt(A_throat / math.pi))  # approximate arc length
    h_friction = lambda_f * (L_scroll / hydraulic_d) * c_scroll**2 / (2 * G) if hydraulic_d > 0 else 0.0

    # 2. Mixing loss at tongue (Gülich §7.5.3)
    h_mixing = 0.5 * (u2 - c_scroll)**2 / (2 * G) * 0.3

    # 3. Diffuser loss in discharge tube
    h_diffuser = 0.2 * (c_scroll**2 - c_discharge**2) / (2 * G) if c_scroll > c_discharge else 0.0

    # 4. Tongue/cutwater incidence loss
    h_incidence = 0.1 * c_scroll**2 / (2 * G)

    # Total head loss
    h_loss_total = h_friction + h_mixing + h_diffuser + h_incidence

    # Pressure recovery coefficient
    # Cp = (p4 - p3) / (0.5 * rho * c3²)
    # p4 - p3 = 0.5*rho*(c3² - c4²) - rho*g*h_loss
    delta_p_recovery = 0.5 * rho * (c_scroll**2 - c_discharge**2) - rho * G * h_loss_total
    cp_volute = delta_p_recovery / (0.5 * rho * c_scroll**2) if c_scroll > 1e-6 else 0.0
    cp_volute = max(-1.0, min(1.0, cp_volute))

    # Loss coefficient ζ = ΔH / (c3²/2g)
    zeta = h_loss_total / (c_scroll**2 / (2 * G)) if c_scroll > 1e-6 else 0.0

    # 8 angular sections (θ = 0, 45, 90, ..., 315°)
    sections = []
    for i, theta in enumerate(range(0, 360, 45)):
        frac = (i + 1) / 8.0
        sections.append({
            "angle_deg": theta,
            "area_m2": round(A_throat * frac, 6),
            "velocity_ms": round(q_volute * frac / (A_throat * frac) if A_throat > 0 else 0.0, 2),
        })

    return VoluteSolverResult(
        total_head_loss_m=round(h_loss_total, 3),
        static_pressure_recovery=round(cp_volute, 4),
        throat_area_m2=round(A_throat, 6),
        scroll_exit_area_m2=round(A_exit, 6),
        mean_velocity_ms=round(c_scroll, 3),
        discharge_velocity_ms=round(c_discharge, 3),
        loss_coefficient=round(zeta, 4),
        sections=sections,
    )
