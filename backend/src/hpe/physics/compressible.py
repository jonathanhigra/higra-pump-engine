"""Compressible flow models for turbomachinery.

Extends HPE from incompressible (pumps) to compressible flow
(compressors, turbines, fans at high Mach), enabling analysis of:

1. Stagnation (total) properties — T0, p0, h0, rho0
2. Mach number distribution along the blade
3. Isentropic relations for ideal gas
4. Real gas corrections (future: CoolProp integration)
5. Compressible velocity triangles
6. Choking and surge estimation

References:
    - Dixon & Hall (2014). Fluid Mechanics and Thermodynamics of
      Turbomachinery, 7th ed.
    - Japikse & Baines (1997). Diffuser Design Technology.
    - Cumpsty, N.A. (2004). Compressor Aerodynamics.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class FluidState:
    """Thermodynamic state of a compressible fluid at a point."""

    T: float  # Static temperature [K]
    p: float  # Static pressure [Pa]
    rho: float  # Static density [kg/m³]
    T0: float  # Stagnation (total) temperature [K]
    p0: float  # Stagnation (total) pressure [Pa]
    rho0: float  # Stagnation density [kg/m³]
    h: float  # Static enthalpy [J/kg]
    h0: float  # Stagnation enthalpy [J/kg]
    V: float  # Absolute velocity [m/s]
    a: float  # Speed of sound [m/s]
    M: float  # Mach number


@dataclass
class GasProperties:
    """Ideal gas properties."""

    name: str = "Air"
    gamma: float = 1.4  # Cp/Cv ratio
    R: float = 287.05  # Specific gas constant [J/(kg·K)]
    cp: float = 1004.5  # Specific heat at constant pressure [J/(kg·K)]

    @property
    def cv(self) -> float:
        return self.cp - self.R


# Common gases
AIR = GasProperties()
CO2 = GasProperties(name="CO2", gamma=1.289, R=188.92, cp=844.0)
NITROGEN = GasProperties(name="N2", gamma=1.4, R=296.8, cp=1039.0)
STEAM = GasProperties(name="Steam", gamma=1.33, R=461.5, cp=2080.0)
R134A = GasProperties(name="R134a", gamma=1.127, R=81.49, cp=865.0)


@dataclass
class CompressibleTriangle:
    """Compressible velocity triangle with thermodynamic state."""

    # Velocities [m/s]
    u: float  # Peripheral velocity
    cm: float  # Meridional component
    cu: float  # Tangential component
    c: float  # Absolute velocity
    w: float  # Relative velocity
    wu: float  # Tangential relative
    beta: float  # Relative angle [deg]
    alpha: float  # Absolute angle [deg]

    # Thermodynamic states
    static: FluidState  # At static conditions
    M_abs: float  # Absolute Mach number
    M_rel: float  # Relative Mach number


def speed_of_sound(T: float, gas: GasProperties = AIR) -> float:
    """Calculate speed of sound in an ideal gas.

    a = sqrt(gamma * R * T)

    Args:
        T: Static temperature [K].
        gas: Gas properties.

    Returns:
        Speed of sound [m/s].
    """
    return math.sqrt(gas.gamma * gas.R * T)


def mach_number(V: float, T: float, gas: GasProperties = AIR) -> float:
    """Calculate Mach number.

    Args:
        V: Velocity [m/s].
        T: Static temperature [K].
        gas: Gas properties.

    Returns:
        Mach number.
    """
    a = speed_of_sound(T, gas)
    return V / a if a > 0 else 0.0


def stagnation_temperature(T: float, V: float, gas: GasProperties = AIR) -> float:
    """Calculate stagnation (total) temperature.

    T0 = T + V² / (2 * cp)

    Args:
        T: Static temperature [K].
        V: Velocity [m/s].
        gas: Gas properties.

    Returns:
        Stagnation temperature T0 [K].
    """
    return T + V**2 / (2.0 * gas.cp)


def stagnation_pressure(
    p: float, T: float, T0: float, gas: GasProperties = AIR,
) -> float:
    """Calculate stagnation (total) pressure from isentropic relation.

    p0/p = (T0/T)^(gamma/(gamma-1))

    Args:
        p: Static pressure [Pa].
        T: Static temperature [K].
        T0: Stagnation temperature [K].
        gas: Gas properties.

    Returns:
        Stagnation pressure p0 [Pa].
    """
    if T <= 0:
        return p
    ratio = T0 / T
    exponent = gas.gamma / (gas.gamma - 1.0)
    return p * ratio**exponent


def static_from_stagnation(
    T0: float, p0: float, V: float, gas: GasProperties = AIR,
) -> tuple[float, float, float]:
    """Calculate static T, p, rho from stagnation conditions and velocity.

    Args:
        T0: Stagnation temperature [K].
        p0: Stagnation pressure [Pa].
        V: Velocity [m/s].
        gas: Gas properties.

    Returns:
        (T_static, p_static, rho_static).
    """
    T = T0 - V**2 / (2.0 * gas.cp)
    T = max(T, 1.0)  # Physical limit

    exp = gas.gamma / (gas.gamma - 1.0)
    p = p0 * (T / T0)**exp
    rho = p / (gas.R * T)

    return T, p, rho


def compute_fluid_state(
    T0: float, p0: float, V: float, gas: GasProperties = AIR,
) -> FluidState:
    """Compute full fluid state from stagnation conditions and velocity.

    Args:
        T0: Stagnation temperature [K].
        p0: Stagnation pressure [Pa].
        V: Absolute velocity [m/s].
        gas: Gas properties.

    Returns:
        Complete FluidState.
    """
    T, p, rho = static_from_stagnation(T0, p0, V, gas)
    rho0 = p0 / (gas.R * T0) if T0 > 0 else rho
    a = speed_of_sound(T, gas)
    M = V / a if a > 0 else 0.0
    h = gas.cp * T
    h0 = gas.cp * T0

    return FluidState(
        T=T, p=p, rho=rho, T0=T0, p0=p0, rho0=rho0,
        h=h, h0=h0, V=V, a=a, M=M,
    )


def compressible_triangle(
    u: float, cm: float, cu: float,
    T0: float, p0: float,
    gas: GasProperties = AIR,
) -> CompressibleTriangle:
    """Build a velocity triangle with compressible thermodynamic state.

    Args:
        u: Peripheral velocity [m/s].
        cm: Meridional component [m/s].
        cu: Tangential absolute component [m/s].
        T0: Stagnation temperature [K].
        p0: Stagnation pressure [Pa].
        gas: Gas properties.

    Returns:
        CompressibleTriangle with velocities and fluid state.
    """
    c = math.sqrt(cm**2 + cu**2)
    wu = u - cu
    w = math.sqrt(cm**2 + wu**2)

    beta = math.degrees(math.atan2(cm, wu)) if wu != 0 else 90.0
    alpha = math.degrees(math.atan2(cm, cu)) if cu != 0 else 90.0

    state = compute_fluid_state(T0, p0, c, gas)

    # Relative Mach (in rotating frame, use w and rothalpy-derived T)
    T_rel = state.T  # Simplified: same static T in rotating frame
    a_rel = speed_of_sound(T_rel, gas)
    M_rel = w / a_rel if a_rel > 0 else 0.0

    return CompressibleTriangle(
        u=u, cm=cm, cu=cu, c=c, w=w, wu=wu,
        beta=beta, alpha=alpha,
        static=state, M_abs=state.M, M_rel=M_rel,
    )


def isentropic_efficiency(
    T01: float, T02: float, p01: float, p02: float,
    gas: GasProperties = AIR,
    is_compressor: bool = True,
) -> float:
    """Calculate isentropic (total-to-total) efficiency.

    Compressor: eta_s = (T02s - T01) / (T02 - T01)
    Turbine:    eta_s = (T01 - T02) / (T01 - T02s)

    where T02s is the isentropic exit temperature.

    Args:
        T01: Inlet stagnation temperature [K].
        T02: Outlet stagnation temperature [K].
        p01: Inlet stagnation pressure [Pa].
        p02: Outlet stagnation pressure [Pa].
        gas: Gas properties.
        is_compressor: True for compressor, False for turbine.

    Returns:
        Isentropic efficiency (0-1).
    """
    if T01 <= 0 or p01 <= 0:
        return 0.0

    # Isentropic exit temperature
    exp = (gas.gamma - 1.0) / gas.gamma
    T02s = T01 * (p02 / p01)**exp

    if is_compressor:
        denom = T02 - T01
        if abs(denom) < 0.01:
            return 1.0
        return (T02s - T01) / denom
    else:
        denom = T01 - T02s
        if abs(denom) < 0.01:
            return 1.0
        return (T01 - T02) / denom


def pressure_ratio(
    T01: float, T02: float, eta_s: float,
    gas: GasProperties = AIR,
    is_compressor: bool = True,
) -> float:
    """Calculate pressure ratio from temperatures and efficiency.

    Args:
        T01: Inlet stagnation temperature [K].
        T02: Outlet stagnation temperature [K].
        eta_s: Isentropic efficiency.
        gas: Gas properties.
        is_compressor: True for compressor, False for turbine.

    Returns:
        Pressure ratio p02/p01.
    """
    if T01 <= 0 or eta_s <= 0:
        return 1.0

    if is_compressor:
        T02s = T01 + (T02 - T01) * eta_s
    else:
        T02s = T01 - (T01 - T02) / eta_s

    exp = gas.gamma / (gas.gamma - 1.0)
    return (T02s / T01)**exp


def choking_mass_flow(
    A: float, p0: float, T0: float, gas: GasProperties = AIR,
) -> float:
    """Calculate maximum (choked) mass flow through an area.

    m_dot_max = A * p0 / sqrt(T0) * sqrt(gamma/R) * (2/(gamma+1))^((gamma+1)/(2*(gamma-1)))

    Args:
        A: Throat area [m²].
        p0: Upstream stagnation pressure [Pa].
        T0: Upstream stagnation temperature [K].
        gas: Gas properties.

    Returns:
        Maximum mass flow rate [kg/s].
    """
    g = gas.gamma
    factor = math.sqrt(g / gas.R) * (2.0 / (g + 1.0))**((g + 1.0) / (2.0 * (g - 1.0)))
    return A * p0 / math.sqrt(T0) * factor
