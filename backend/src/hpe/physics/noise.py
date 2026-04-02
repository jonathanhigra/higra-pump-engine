"""Aeroacoustic noise prediction for fans and compressors.

Estimates broadband and tonal noise from impeller blade-passage
interactions based on empirical correlations.

Components:
1. Blade-passing frequency (BPF) tonal noise
2. Broadband turbulence noise
3. Specific sound power level (Lw,s)

References:
    - Madison, R.D. (1949). Fan Engineering.
    - Neise, W. (1992). Review of fan noise generation mechanisms.
    - VDI 3731 (fan noise standard).
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class NoiseResult:
    """Aeroacoustic noise estimation result."""

    bpf: float  # Blade passing frequency [Hz]
    sound_power_level: float  # Lw [dB re 1 pW]
    specific_sound_power: float  # Lw,s [dB] (size-independent)
    a_weighted_level: float  # LwA [dB(A)] approximate
    tip_mach: float  # Tip Mach number
    warnings: list[str]


def estimate_fan_noise(
    flow_rate: float,
    pressure_rise: float,
    rpm: float,
    d2: float,
    blade_count: int,
    efficiency: float = 0.75,
    rho: float = 1.2,
    c_sound: float = 343.0,
) -> NoiseResult:
    """Estimate fan/compressor noise level.

    Uses the Madison/VDI approach:
        Lw = Lw,s + 10*log10(Q) + 20*log10(dp)

    where Lw,s is the specific sound power level depending on
    fan type and operating point.

    Args:
        flow_rate: Q [m³/s].
        pressure_rise: Total pressure rise dp [Pa].
        rpm: Rotational speed [rev/min].
        d2: Impeller outer diameter [m].
        blade_count: Number of blades.
        efficiency: Total-to-total efficiency.
        rho: Air density [kg/m³].
        c_sound: Speed of sound [m/s].

    Returns:
        NoiseResult with levels and frequencies.
    """
    warnings: list[str] = []

    # Blade passing frequency
    bpf = blade_count * rpm / 60.0

    # Tip speed and Mach
    u_tip = math.pi * d2 * rpm / 60.0
    tip_mach = u_tip / c_sound

    if tip_mach > 0.9:
        warnings.append(f"Tip Mach {tip_mach:.2f} > 0.9: transonic noise issues")

    # Specific sound power level (empirical, dB)
    # Centrifugal fans: Lw,s ≈ -10 to +5 dB
    # Axial fans: Lw,s ≈ -5 to +10 dB
    # Lower efficiency → more noise
    eta_factor = max(0.5, efficiency)
    lw_s = 2.0 + 10.0 * (1.0 - eta_factor)

    # Tip speed correction: noise increases with u^5-6
    # Reference: u_ref = 50 m/s
    tip_correction = 50.0 * math.log10(u_tip / 50.0) if u_tip > 10 else 0

    lw_s += tip_correction

    # Sound power level
    q_term = 10.0 * math.log10(max(flow_rate, 1e-6))
    dp_term = 20.0 * math.log10(max(pressure_rise, 1.0))
    lw = lw_s + q_term + dp_term

    # A-weighting approximation (BPF dependent)
    # Low BPF (<500 Hz) gets significant A-weighting penalty
    if bpf < 200:
        a_correction = -15.0
    elif bpf < 500:
        a_correction = -5.0
    elif bpf < 2000:
        a_correction = 0.0
    else:
        a_correction = -2.0

    lwa = lw + a_correction

    return NoiseResult(
        bpf=bpf,
        sound_power_level=lw,
        specific_sound_power=lw_s,
        a_weighted_level=lwa,
        tip_mach=tip_mach,
        warnings=warnings,
    )
