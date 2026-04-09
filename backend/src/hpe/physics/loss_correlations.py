"""Correlações empíricas clássicas — slip, disk friction, vol/mech eff,
affinity laws, Nss, specific diameter, Reynolds correction.

Cobre as melhorias #1-10 e fornece backend para os endpoints #16-20.

Referências:
    - Wiesner, F.J. (1967) "A review of slip factors for centrifugal impellers"
    - Stodola, A. (1927) "Steam and Gas Turbines"
    - Stanitz, J.D. (1952) "One-dimensional compressible flow in vaneless diffusers"
    - Daily, J.W. & Nece, R.E. (1960) "Chamber dimension effects on induced flow
      and frictional resistance of enclosed rotating disks"
    - Gülich, J.F. (2014) "Centrifugal Pumps", §3.6, §3.7, §3.10
    - Cordier, O. (1953) Specific diameter chart
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional


# ===========================================================================
# 1. Slip factors (3 models)
# ===========================================================================

@dataclass
class SlipFactorResult:
    """Resultado do cálculo de slip factor."""
    wiesner: float
    stodola: float
    stanitz: float
    recommended: str   # 'wiesner' for n_blades >= 3
    recommended_value: float

    def to_dict(self) -> dict:
        return {
            "wiesner": round(self.wiesner, 4),
            "stodola": round(self.stodola, 4),
            "stanitz": round(self.stanitz, 4),
            "recommended": self.recommended,
            "recommended_value": round(self.recommended_value, 4),
        }


def compute_slip_factors(
    n_blades: int,
    beta2_deg: float,
    d1_d2_ratio: float = 0.5,
) -> SlipFactorResult:
    """Calcular slip factors via 3 correlações clássicas.

    Parameters
    ----------
    n_blades : int
        Número de pás do rotor.
    beta2_deg : float
        Ângulo de saída (relativo, em graus).
    d1_d2_ratio : float
        Razão entre diâmetro de entrada e saída.
    """
    beta2 = math.radians(beta2_deg)

    # Wiesner (industry standard for n_blades ≥ 3)
    wiesner = 1.0 - (math.sqrt(math.sin(math.radians(90 - beta2_deg))) / (n_blades ** 0.7))
    if d1_d2_ratio > 0.5:
        # Correção quando entrada está perto da saída
        eps_lim = math.exp(-8.16 * math.sin(math.radians(90 - beta2_deg)) / n_blades)
        if d1_d2_ratio > eps_lim:
            wiesner *= 1 - ((d1_d2_ratio - eps_lim) / (1 - eps_lim)) ** 3

    # Stodola (mais simples, conservativa)
    stodola = 1.0 - (math.pi * math.sin(math.radians(90 - beta2_deg)) / n_blades)

    # Stanitz (originalmente para difusores radiais sem pás)
    stanitz = 1.0 - 0.63 * math.pi / n_blades

    recommended = "wiesner" if n_blades >= 3 else "stodola"
    rec_val = wiesner if recommended == "wiesner" else stodola

    return SlipFactorResult(
        wiesner=max(0.5, min(1.0, wiesner)),
        stodola=max(0.5, min(1.0, stodola)),
        stanitz=max(0.5, min(1.0, stanitz)),
        recommended=recommended,
        recommended_value=max(0.5, min(1.0, rec_val)),
    )


# ===========================================================================
# 2. Disk friction loss — Daily-Nece
# ===========================================================================

@dataclass
class DiskFrictionResult:
    cm_coefficient: float       # disk friction coefficient
    power_loss_W: float
    re_disk: float
    regime: str                 # 'laminar' | 'transitional' | 'turbulent'

    def to_dict(self) -> dict:
        return {
            "cm_coefficient": round(self.cm_coefficient, 6),
            "power_loss_W": round(self.power_loss_W, 2),
            "re_disk": round(self.re_disk, 0),
            "regime": self.regime,
        }


def compute_disk_friction(
    d2: float,
    rpm: float,
    rho: float = 998.2,
    nu: float = 1e-6,
    s_axial_gap: float = 0.005,
) -> DiskFrictionResult:
    """Daily-Nece (1960) regime maps.

    Re_disk = ω r² / ν
    Regimes:
      I  Re < 1e4         laminar merged
      II 1e4 ≤ Re < 1e5    laminar separated
      III Re ≥ 1e5         turbulent merged
      IV Re ≥ 1e6          turbulent separated

    Cm para regime IV: Cm = 0.0102 (s/r)^0.1 / Re^0.2
    P_loss = Cm × ρ × ω³ × r⁵
    """
    omega = 2 * math.pi * rpm / 60
    r = d2 / 2
    re_disk = omega * r * r / nu

    if re_disk < 1e4:
        regime = "laminar"
        cm = 2 * math.pi / (re_disk * (s_axial_gap / r))
    elif re_disk < 1e5:
        regime = "transitional"
        cm = 3.7 * (s_axial_gap / r) ** 0.1 / (re_disk ** 0.5)
    elif re_disk < 1e6:
        regime = "turbulent_merged"
        cm = 0.080 / (re_disk ** 0.25)
    else:
        regime = "turbulent_separated"
        cm = 0.0102 * (s_axial_gap / r) ** 0.1 / (re_disk ** 0.2)

    p_loss = cm * rho * (omega ** 3) * (r ** 5)
    # Both sides of disk
    p_loss *= 2

    return DiskFrictionResult(
        cm_coefficient=cm,
        power_loss_W=p_loss,
        re_disk=re_disk,
        regime=regime,
    )


# ===========================================================================
# 3. Volumetric efficiency — clearance leakage
# ===========================================================================

@dataclass
class VolumetricEfficiency:
    eta_v: float                # 0..1
    leakage_flow: float         # m³/s
    leakage_fraction: float     # Q_leak/Q_total

    def to_dict(self) -> dict:
        return {
            "eta_v": round(self.eta_v, 4),
            "leakage_flow_m3s": round(self.leakage_flow, 6),
            "leakage_fraction": round(self.leakage_fraction, 4),
        }


def compute_volumetric_efficiency(
    Q: float,
    H: float,
    d_seal: float,
    clearance: float = 0.0003,
    seal_length: float = 0.020,
    rho: float = 998.2,
    Cd: float = 0.6,
) -> VolumetricEfficiency:
    """Vazamento na vedação labirinto/folga radial.

    Q_leak = Cd × A_clear × √(2 g H_diff)
    A_clear = π × d_seal × clearance
    H_diff ≈ H × (1 - r²/r²) ≈ H/2 (correção empírica)
    """
    A = math.pi * d_seal * clearance
    H_diff = 0.5 * H  # parcela da H sentida na folga
    g = 9.81
    Q_leak = Cd * A * math.sqrt(2 * g * H_diff)

    eta_v = Q / (Q + Q_leak) if (Q + Q_leak) > 0 else 1.0
    return VolumetricEfficiency(
        eta_v=eta_v,
        leakage_flow=Q_leak,
        leakage_fraction=Q_leak / max(Q, 1e-9),
    )


# ===========================================================================
# 4. Mechanical efficiency — bearing + seal losses
# ===========================================================================

@dataclass
class MechanicalEfficiency:
    eta_m: float
    bearing_loss_W: float
    seal_loss_W: float
    total_mech_loss_W: float

    def to_dict(self) -> dict:
        return {
            "eta_m": round(self.eta_m, 4),
            "bearing_loss_W": round(self.bearing_loss_W, 2),
            "seal_loss_W": round(self.seal_loss_W, 2),
            "total_mech_loss_W": round(self.total_mech_loss_W, 2),
        }


def compute_mechanical_efficiency(
    P_hydraulic: float,
    rpm: float,
    n_bearings: int = 2,
    bearing_loss_factor: float = 0.005,
    seal_loss_per_seal: float = 50.0,
    n_seals: int = 1,
) -> MechanicalEfficiency:
    """Estimativa empírica das perdas mecânicas.

    P_bearing ≈ factor × P_hydraulic × n_bearings
    P_seal ≈ constante por sela (Gülich §3.6.5)
    """
    p_bear = bearing_loss_factor * P_hydraulic * n_bearings
    p_seal = seal_loss_per_seal * n_seals
    total = p_bear + p_seal
    eta_m = P_hydraulic / (P_hydraulic + total) if (P_hydraulic + total) > 0 else 1.0
    return MechanicalEfficiency(
        eta_m=eta_m,
        bearing_loss_W=p_bear,
        seal_loss_W=p_seal,
        total_mech_loss_W=total,
    )


# ===========================================================================
# 5. Affinity laws — scaling between operating points
# ===========================================================================

@dataclass
class AffinityScaling:
    Q_new: float
    H_new: float
    P_new: float
    eta_new: float
    Re_correction_factor: float

    def to_dict(self) -> dict:
        return {
            "Q_new_m3s": round(self.Q_new, 6),
            "H_new_m": round(self.H_new, 3),
            "P_new_W": round(self.P_new, 2),
            "eta_new": round(self.eta_new, 4),
            "Re_correction": round(self.Re_correction_factor, 4),
        }


def apply_affinity_laws(
    Q_old: float, H_old: float, P_old: float, eta_old: float,
    n_old: float, n_new: float,
    d_old: float = 1.0, d_new: float = 1.0,
    apply_re_correction: bool = True,
) -> AffinityScaling:
    """Scaling Q ∝ n·D³, H ∝ n²·D², P ∝ n³·D⁵ + correção de Re para η.

    Moody (1925) Re correction:
        (1 - η_new) / (1 - η_old) = (Re_old / Re_new) ^ 0.25
    """
    n_ratio = n_new / n_old if n_old > 0 else 1.0
    d_ratio = d_new / d_old if d_old > 0 else 1.0

    Q_new = Q_old * n_ratio * (d_ratio ** 3)
    H_new = H_old * (n_ratio ** 2) * (d_ratio ** 2)
    P_new = P_old * (n_ratio ** 3) * (d_ratio ** 5)

    re_factor = 1.0
    if apply_re_correction:
        re_ratio = (n_ratio * (d_ratio ** 2))   # Re ∝ n × D²
        re_factor = re_ratio ** 0.25
        eta_new = 1 - (1 - eta_old) / re_factor
    else:
        eta_new = eta_old

    return AffinityScaling(
        Q_new=Q_new, H_new=H_new, P_new=P_new,
        eta_new=eta_new, Re_correction_factor=re_factor,
    )


# ===========================================================================
# 6. Suction specific speed (Nss)
# ===========================================================================

def compute_suction_specific_speed(
    Q: float, npsh_r: float, rpm: float,
) -> float:
    """Nss = N · √Q / NPSHr^0.75  (unidades SI: rpm, m³/s, m).

    Valores típicos:
      < 8000   conservador
      ~ 11000  industry standard
      > 14000  agressivo (risco cavitação)
    """
    if npsh_r <= 0 or Q <= 0:
        return 0.0
    return rpm * math.sqrt(Q) / (npsh_r ** 0.75)


# ===========================================================================
# 7. Specific diameter Ds (Cordier)
# ===========================================================================

def compute_specific_diameter(D2: float, H: float, Q: float) -> float:
    """Ds = D × (g·H)^0.25 / √Q  (Cordier diagram).

    Junto com ωs (specific speed), permite localizar a bomba no Cordier
    diagram para verificar se está na região ótima.
    """
    g = 9.81
    if Q <= 0:
        return 0.0
    return D2 * ((g * H) ** 0.25) / math.sqrt(Q)


def compute_specific_speed_omega(Q: float, H: float, rpm: float) -> float:
    """ωs = ω·√Q / (gH)^0.75 (dimensionless)."""
    g = 9.81
    omega = 2 * math.pi * rpm / 60
    if H <= 0:
        return 0.0
    return omega * math.sqrt(Q) / ((g * H) ** 0.75)


# ===========================================================================
# 8. Reynolds correction (η scaling)
# ===========================================================================

def compute_reynolds_correction(
    eta_ref: float, Re_ref: float, Re_target: float,
    method: str = "moody",
) -> float:
    """Corrigir eficiência de uma bomba modelo para protótipo.

    method:
      'moody':   (1-η_p)/(1-η_m) = (Re_m/Re_p)^0.25
      'ackeret': (1-η_p)/(1-η_m) = 0.5 + 0.5·(Re_m/Re_p)^0.2
      'pfleider': uses Pfleiderer correction (more conservative)
    """
    if Re_target <= 0 or Re_ref <= 0:
        return eta_ref
    ratio = Re_ref / Re_target

    if method == "moody":
        f = ratio ** 0.25
    elif method == "ackeret":
        f = 0.5 + 0.5 * (ratio ** 0.2)
    else:
        f = ratio ** 0.16

    return 1.0 - (1.0 - eta_ref) * f


# ===========================================================================
# 9. Hub-shroud meridional curvature
# ===========================================================================

@dataclass
class MeridionalCurvature:
    hub_curvature_max: float
    shroud_curvature_max: float
    hub_inflection_z: Optional[float]
    shroud_inflection_z: Optional[float]
    quality_score: float    # 0..1, maior = melhor

    def to_dict(self) -> dict:
        return {
            "hub_curvature_max": round(self.hub_curvature_max, 4),
            "shroud_curvature_max": round(self.shroud_curvature_max, 4),
            "hub_inflection_z": self.hub_inflection_z,
            "shroud_inflection_z": self.shroud_inflection_z,
            "quality_score": round(self.quality_score, 3),
        }


def analyze_meridional_curvature(
    hub_points: list[tuple[float, float]],
    shroud_points: list[tuple[float, float]],
) -> MeridionalCurvature:
    """Avaliar suavidade do canal meridional (hub e shroud).

    Calcula curvatura por diferenças finitas e aponta inflexões — pontos
    onde a curvatura muda de sinal sugerem regiões de descolamento.
    """
    def curvatures(pts: list[tuple[float, float]]) -> list[float]:
        if len(pts) < 3:
            return [0.0]
        c = []
        for i in range(1, len(pts) - 1):
            x0, y0 = pts[i - 1]
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            # 2nd derivative approximation
            d2x = x2 - 2 * x1 + x0
            d2y = y2 - 2 * y1 + y0
            c.append(math.hypot(d2x, d2y))
        return c

    def find_inflection(pts, curvs) -> Optional[float]:
        for i in range(1, len(curvs)):
            if curvs[i - 1] * curvs[i] < 0:
                return pts[i + 1][1]   # z-coord
        return None

    hub_c = curvatures(hub_points)
    shr_c = curvatures(shroud_points)

    hub_max = max(hub_c) if hub_c else 0.0
    shr_max = max(shr_c) if shr_c else 0.0

    # Quality: smaller curvatures → higher score
    max_total = max(hub_max, shr_max, 1e-9)
    quality = 1.0 / (1.0 + max_total * 100)

    return MeridionalCurvature(
        hub_curvature_max=hub_max,
        shroud_curvature_max=shr_max,
        hub_inflection_z=find_inflection(hub_points, hub_c),
        shroud_inflection_z=find_inflection(shroud_points, shr_c),
        quality_score=quality,
    )
