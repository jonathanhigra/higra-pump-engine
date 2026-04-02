"""Real gas property interface for non-ideal fluids.

Provides thermodynamic properties for refrigerants, ORC fluids,
and supercritical CO2 applications. Uses a simplified corresponding
states model when CoolProp is not available, with a CoolProp backend
when installed.

Supported fluids (built-in):
    - R134a, R410A, R744 (CO2), R245fa
    - Water/Steam
    - Custom: user-specified with critical properties

References:
    - Lemmon et al. (2010). NIST Reference Fluid Thermodynamic
      and Transport Properties (REFPROP).
    - Bell et al. (2014). Pure and Pseudo-pure Fluid Thermophysical
      Property Evaluation (CoolProp).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

try:
    import CoolProp.CoolProp as CP
    HAS_COOLPROP = True
except ImportError:
    HAS_COOLPROP = False


@dataclass
class FluidProperties:
    """Fluid critical/reference properties for corresponding states."""

    name: str
    molar_mass: float  # [kg/mol]
    T_crit: float  # Critical temperature [K]
    p_crit: float  # Critical pressure [Pa]
    omega: float  # Acentric factor
    cp_ideal: float  # Ideal gas Cp at 300K [J/(kg·K)]
    gamma_ideal: float  # Cp/Cv at ideal conditions


# Built-in fluid library
FLUIDS = {
    "R134a": FluidProperties("R134a", 0.10203, 374.21, 4059280, 0.327, 865, 1.127),
    "R410A": FluidProperties("R410A", 0.07259, 344.51, 4901200, 0.296, 830, 1.16),
    "CO2": FluidProperties("CO2", 0.04401, 304.13, 7377300, 0.225, 844, 1.289),
    "R245fa": FluidProperties("R245fa", 0.13405, 427.16, 3651000, 0.378, 900, 1.08),
    "Water": FluidProperties("Water", 0.01802, 647.10, 22064000, 0.344, 4182, 1.33),
    "Air": FluidProperties("Air", 0.02897, 132.53, 3786000, 0.035, 1004.5, 1.4),
}


@dataclass
class RealGasState:
    """Thermodynamic state from real gas calculation."""

    T: float  # Temperature [K]
    p: float  # Pressure [Pa]
    rho: float  # Density [kg/m³]
    h: float  # Specific enthalpy [J/kg]
    s: float  # Specific entropy [J/(kg·K)]
    cp: float  # Specific heat at const pressure [J/(kg·K)]
    cv: float  # Specific heat at const volume [J/(kg·K)]
    gamma: float  # Cp/Cv
    a: float  # Speed of sound [m/s]
    Z: float  # Compressibility factor (1 = ideal gas)
    phase: str  # "gas", "liquid", "supercritical", "twophase"
    source: str  # "coolprop" or "corresponding_states"


def get_state(
    fluid: str,
    T: float,
    p: float,
) -> RealGasState:
    """Get thermodynamic state at given T and p.

    Uses CoolProp if available, otherwise falls back to
    corresponding states model.

    Args:
        fluid: Fluid name (must be in FLUIDS dict or CoolProp name).
        T: Temperature [K].
        p: Pressure [Pa].

    Returns:
        RealGasState with all properties.
    """
    if HAS_COOLPROP:
        return _coolprop_state(fluid, T, p)
    return _corresponding_states(fluid, T, p)


def _coolprop_state(fluid: str, T: float, p: float) -> RealGasState:
    """Get state from CoolProp."""
    try:
        rho = CP.PropsSI("D", "T", T, "P", p, fluid)
        h = CP.PropsSI("H", "T", T, "P", p, fluid)
        s = CP.PropsSI("S", "T", T, "P", p, fluid)
        cp = CP.PropsSI("C", "T", T, "P", p, fluid)
        cv = CP.PropsSI("O", "T", T, "P", p, fluid)
        a = CP.PropsSI("A", "T", T, "P", p, fluid)
        phase_idx = CP.PropsSI("Phase", "T", T, "P", p, fluid)
        Z = p / (rho * (CP.PropsSI("GAS_CONSTANT", fluid) / CP.PropsSI("M", fluid)) * T) if rho > 0 else 1.0

        phase_map = {0: "liquid", 5: "gas", 6: "twophase", 3: "supercritical"}
        phase = phase_map.get(int(phase_idx), "unknown")

        return RealGasState(
            T=T, p=p, rho=rho, h=h, s=s, cp=cp, cv=cv,
            gamma=cp / cv if cv > 0 else 1.4,
            a=a, Z=Z, phase=phase, source="coolprop",
        )
    except Exception:
        return _corresponding_states(fluid, T, p)


def _corresponding_states(fluid: str, T: float, p: float) -> RealGasState:
    """Approximate state using Peng-Robinson-like corresponding states."""
    props = FLUIDS.get(fluid, FLUIDS["Air"])
    R_gas = 8.314 / props.molar_mass  # Specific gas constant

    Tr = T / props.T_crit
    Pr = p / props.p_crit

    # Compressibility factor (simplified van der Waals)
    B = 0.083 - 0.422 / Tr**1.6  # Pitzer B0
    B1 = 0.139 - 0.172 / Tr**4.2  # Pitzer B1
    Z = 1.0 + (B + props.omega * B1) * Pr / Tr
    Z = max(0.1, min(1.5, Z))

    rho = p / (Z * R_gas * T) if T > 0 else 1.0

    # Cp departure
    cp = props.cp_ideal * (1.0 + 0.3 * (1 - Z))
    gamma = props.gamma_ideal * Z**0.1
    cv = cp / gamma

    # Speed of sound
    a = math.sqrt(gamma * R_gas * T * Z) if T > 0 else 300.0

    # Enthalpy (reference: 0 at 273.15 K)
    h = cp * (T - 273.15)
    s = cp * math.log(T / 273.15) - R_gas * math.log(p / 101325) if T > 0 and p > 0 else 0

    # Phase determination
    if Tr > 1.0 and Pr > 1.0:
        phase = "supercritical"
    elif Tr > 1.0:
        phase = "gas"
    elif Pr > 1.0:
        phase = "liquid"
    else:
        phase = "gas" if Tr > 0.85 else "liquid"

    return RealGasState(
        T=T, p=p, rho=rho, h=h, s=s, cp=cp, cv=cv,
        gamma=gamma, a=a, Z=Z, phase=phase,
        source="corresponding_states",
    )
