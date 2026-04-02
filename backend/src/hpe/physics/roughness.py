"""Surface roughness effects on hydraulic efficiency.

Roughness increases friction losses in the blade passages and volute.
This module implements the Gülich (2014) §3.10 roughness correction.

References:
    Gülich (2014) §3.10 — Surface roughness and hydraulic losses.
    Moody (1944) — Friction factors for pipe flow.
"""
from __future__ import annotations
import math


def calc_roughness_correction(
    roughness_ra: float,    # Average roughness Ra [m]
    d2: float,              # Outlet diameter [m]
    b2: float,              # Channel width [m]
    flow_rate: float,       # Q [m³/s]
    rpm: float,             # N [rpm]
    nq: float,              # Specific speed
    rho: float = 998.0,
    mu: float = 1.0e-3,     # Dynamic viscosity [Pa·s]
) -> dict:
    """Calculate hydraulic efficiency correction for surface roughness.

    Gülich (2014) §3.10 method:
    1. Compute hydraulic diameter Dh of passage
    2. Compute relative roughness ε/Dh
    3. Compute Reynolds number Re
    4. Compute friction factor via Colebrook (turbulent)
    5. Compare with smooth pipe → efficiency correction

    Args:
        roughness_ra: Ra surface roughness [m] (typical: 6-50 μm for cast iron).
        d2, b2: Impeller geometry [m].
        flow_rate, rpm: Operating point.
        nq: Specific speed.

    Returns:
        Dict with efficiency correction and friction factors.
    """
    # Hydraulic diameter of blade passage (approximate)
    blade_count_est = 7  # typical
    pitch_out = math.pi * d2 / blade_count_est
    dh = 2 * b2 * pitch_out / (b2 + pitch_out)  # rectangular channel Dh
    dh = max(dh, 1e-4)

    # Relative roughness (Gülich uses ks ≈ 6.3 Ra for cast iron)
    ks = 6.3 * roughness_ra   # equivalent sand roughness [m]
    eps_rel = ks / dh

    # Flow velocity in channel
    omega = 2 * math.pi * rpm / 60
    u2 = omega * d2 / 2
    # Meridional velocity estimate
    cm2 = flow_rate / (math.pi * d2 * b2 * 0.88)  # with blockage
    w2 = math.sqrt(cm2**2 + (u2 * 0.3)**2)  # approximate relative velocity at TE

    # Reynolds number
    nu = mu / rho
    re = w2 * dh / nu if nu > 0 else 1e6
    re = max(re, 1000)

    # Smooth wall friction factor (Blasius for turbulent)
    f_smooth = 0.316 * re**(-0.25) if re < 1e5 else 0.184 * re**(-0.2)

    # Rough wall friction factor (Colebrook iteration)
    f_rough = _colebrook(re, eps_rel)

    # Efficiency correction (Gülich Eq. 3.65)
    # delta_eta = (f_rough/f_smooth - 1) * 0.05  [rough scaling]
    ratio = f_rough / f_smooth if f_smooth > 0 else 1.0
    delta_eta = max(0.0, (ratio - 1.0) * 0.04)
    delta_eta = min(delta_eta, 0.08)  # cap at 8%

    return {
        "roughness_ra_m": roughness_ra,
        "roughness_ks_m": round(ks, 8),
        "hydraulic_diameter_m": round(dh, 4),
        "relative_roughness": round(eps_rel, 6),
        "reynolds_number": round(re, 0),
        "f_smooth": round(f_smooth, 6),
        "f_rough": round(f_rough, 6),
        "efficiency_penalty": round(delta_eta, 5),
    }


def _colebrook(re: float, eps_rel: float, n_iter: int = 10) -> float:
    """Colebrook-White friction factor via Newton iteration."""
    if re < 2300:
        return 64 / re  # laminar
    # Initial guess: Swamee-Jain
    f = 0.25 / (math.log10(eps_rel / 3.7 + 5.74 / re**0.9))**2
    for _ in range(n_iter):
        rhs = -2 * math.log10(eps_rel / 3.7 + 2.51 / (re * math.sqrt(f)))
        f_new = (1 / rhs)**2
        if abs(f_new - f) < 1e-8:
            break
        f = f_new
    return max(0.008, f)
