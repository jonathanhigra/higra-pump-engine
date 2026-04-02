"""Imperial / metric unit conversion for HPE.

Supports:
    Flow rate:   m³/s ↔ GPM (US gallons/min) ↔ ft³/s ↔ m³/h
    Head:        m ↔ ft ↔ psi (for a given fluid density)
    Power:       W ↔ hp (horsepower)
    Diameter:    m ↔ mm ↔ in ↔ ft
    Speed:       rpm (no conversion needed)
    Pressure:    Pa ↔ psi ↔ bar ↔ kPa ↔ atm
    Density:     kg/m³ ↔ lbm/ft³

Usage:
    from hpe.units import UnitConverter
    q_gpm = UnitConverter.m3s_to_gpm(0.05)
"""
from __future__ import annotations


class UnitConverter:
    """Convert between SI and Imperial units."""

    # Flow rate
    GPM_PER_M3S = 264.172052  # 1 m³/s = 264.172 US GPM
    FT3S_PER_M3S = 35.3147    # 1 m³/s = 35.3147 ft³/s
    M3H_PER_M3S = 3600.0      # 1 m³/s = 3600 m³/h

    # Head / length
    FT_PER_M = 3.28084         # 1 m = 3.28084 ft
    IN_PER_M = 39.3701         # 1 m = 39.3701 in
    MM_PER_M = 1000.0

    # Pressure
    PSI_PER_PA = 1.45038e-4    # 1 Pa = 1.45038e-4 psi
    BAR_PER_PA = 1e-5
    KPA_PER_PA = 1e-3
    ATM_PER_PA = 9.8692e-6

    # Power
    HP_PER_W = 1.34102e-3      # 1 W = 0.001341 hp

    # Density
    LBM_FT3_PER_KG_M3 = 0.062428  # 1 kg/m³ = 0.062428 lbm/ft³

    # Flow rate conversions
    @staticmethod
    def m3s_to_gpm(q_m3s: float) -> float:
        return q_m3s * UnitConverter.GPM_PER_M3S

    @staticmethod
    def gpm_to_m3s(q_gpm: float) -> float:
        return q_gpm / UnitConverter.GPM_PER_M3S

    @staticmethod
    def m3s_to_m3h(q_m3s: float) -> float:
        return q_m3s * UnitConverter.M3H_PER_M3S

    @staticmethod
    def m3h_to_m3s(q_m3h: float) -> float:
        return q_m3h / UnitConverter.M3H_PER_M3S

    @staticmethod
    def m3s_to_ft3s(q_m3s: float) -> float:
        return q_m3s * UnitConverter.FT3S_PER_M3S

    # Head conversions
    @staticmethod
    def m_to_ft(h_m: float) -> float:
        return h_m * UnitConverter.FT_PER_M

    @staticmethod
    def ft_to_m(h_ft: float) -> float:
        return h_ft / UnitConverter.FT_PER_M

    @staticmethod
    def m_to_psi(h_m: float, rho: float = 998.0) -> float:
        """Convert head [m] to pressure [psi] for given density."""
        p_pa = rho * 9.81 * h_m
        return p_pa * UnitConverter.PSI_PER_PA

    @staticmethod
    def psi_to_m(p_psi: float, rho: float = 998.0) -> float:
        """Convert pressure [psi] to head [m]."""
        p_pa = p_psi / UnitConverter.PSI_PER_PA
        return p_pa / (rho * 9.81)

    # Diameter conversions
    @staticmethod
    def m_to_mm(d_m: float) -> float:
        return d_m * 1000.0

    @staticmethod
    def mm_to_m(d_mm: float) -> float:
        return d_mm / 1000.0

    @staticmethod
    def m_to_in(d_m: float) -> float:
        return d_m * UnitConverter.IN_PER_M

    @staticmethod
    def in_to_m(d_in: float) -> float:
        return d_in / UnitConverter.IN_PER_M

    # Power conversions
    @staticmethod
    def w_to_hp(p_w: float) -> float:
        return p_w * UnitConverter.HP_PER_W

    @staticmethod
    def hp_to_w(p_hp: float) -> float:
        return p_hp / UnitConverter.HP_PER_W

    # Pressure conversions
    @staticmethod
    def pa_to_psi(p_pa: float) -> float:
        return p_pa * UnitConverter.PSI_PER_PA

    @staticmethod
    def psi_to_pa(p_psi: float) -> float:
        return p_psi / UnitConverter.PSI_PER_PA

    @staticmethod
    def pa_to_bar(p_pa: float) -> float:
        return p_pa * UnitConverter.BAR_PER_PA

    @staticmethod
    def pa_to_kpa(p_pa: float) -> float:
        return p_pa * UnitConverter.KPA_PER_PA

    @staticmethod
    def sizing_to_imperial(result: dict) -> dict:
        """Convert a sizing result dict from SI to Imperial units."""
        uc = UnitConverter
        out = dict(result)
        if "impeller_d2" in out:
            out["impeller_d2_in"] = round(uc.m_to_in(out["impeller_d2"]), 3)
        if "impeller_d1" in out:
            out["impeller_d1_in"] = round(uc.m_to_in(out["impeller_d1"]), 3)
        if "impeller_b2" in out:
            out["impeller_b2_in"] = round(uc.m_to_in(out["impeller_b2"]), 4)
        if "estimated_power" in out:
            out["estimated_power_hp"] = round(uc.w_to_hp(out["estimated_power"]), 2)
        if "estimated_npsh_r" in out:
            out["estimated_npsh_r_ft"] = round(uc.m_to_ft(out["estimated_npsh_r"]), 2)
        return out


def convert_input_imperial(flow_gpm: float = 0, head_ft: float = 0,
                             rpm: float = 1750, rho_lbm_ft3: float = 62.4) -> dict:
    """Convert Imperial pump inputs to SI for HPE.

    Args:
        flow_gpm: Flow rate [US GPM].
        head_ft: Total head [ft].
        rpm: Rotational speed [rpm].
        rho_lbm_ft3: Fluid density [lbm/ft³].

    Returns:
        Dict with SI values: flow_rate_m3s, head_m, rpm, rho_kg_m3.
    """
    return {
        "flow_rate_m3s": UnitConverter.gpm_to_m3s(flow_gpm),
        "head_m": UnitConverter.ft_to_m(head_ft),
        "rpm": rpm,
        "rho_kg_m3": rho_lbm_ft3 / UnitConverter.LBM_FT3_PER_KG_M3,
    }
