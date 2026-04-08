"""Boundary condition generation for OpenFOAM pump simulations.

Calculates physical BC values from operating point data and
generates the 0/ directory files with correct values.

Two APIs provided:
  1. Low-level: calc_bc_values() + generate_mrf_properties() — string generation
  2. File-writing: write_U(), write_p(), write_k(), write_epsilon(), write_nut()
     — write directly to the 0/ sub-directory of a case.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from hpe.core.models import OperatingPoint
    from hpe.geometry.models import RunnerGeometryParams


@dataclass
class BCValues:
    """Computed boundary condition values for OpenFOAM."""

    u_inlet: float  # Inlet velocity magnitude [m/s]
    omega_rotor: float  # Rotor angular velocity [rad/s]
    k_init: float  # Turbulent kinetic energy [m2/s2]
    omega_turb_init: float  # Specific dissipation rate [1/s]
    nu: float  # Kinematic viscosity [m2/s]


def calc_bc_values(
    flow_rate: float,
    rpm: float,
    d_inlet: float,
    d_hub: float = 0.0,
    fluid_density: float = 998.2,
    fluid_viscosity: float = 1.003e-3,
    turbulence_intensity: float = 0.05,
    length_scale_ratio: float = 0.1,
) -> BCValues:
    """Calculate boundary condition values from operating parameters.

    Args:
        flow_rate: Q [m3/s].
        rpm: Rotational speed [rev/min].
        d_inlet: Inlet pipe diameter [m].
        d_hub: Hub diameter at inlet [m].
        fluid_density: rho [kg/m3].
        fluid_viscosity: mu [Pa.s].
        turbulence_intensity: I = u'/U (typical 0.03-0.10).
        length_scale_ratio: l/D ratio for turbulence length scale.

    Returns:
        BCValues with all computed values.
    """
    # Kinematic viscosity
    nu = fluid_viscosity / fluid_density

    # Inlet velocity
    a_inlet = math.pi / 4.0 * (d_inlet**2 - d_hub**2)
    u_inlet = flow_rate / a_inlet if a_inlet > 0 else 0.0

    # Rotor angular velocity
    omega_rotor = 2.0 * math.pi * rpm / 60.0

    # Turbulence quantities (k-omega SST)
    # k = 1.5 * (U * I)^2
    k_init = 1.5 * (u_inlet * turbulence_intensity) ** 2
    k_init = max(k_init, 1e-6)

    # omega = k^0.5 / (C_mu^0.25 * l)
    # where l = length_scale_ratio * D_inlet
    c_mu = 0.09
    length_scale = length_scale_ratio * d_inlet
    if length_scale > 0:
        omega_turb = k_init**0.5 / (c_mu**0.25 * length_scale)
    else:
        omega_turb = 100.0

    return BCValues(
        u_inlet=u_inlet,
        omega_rotor=omega_rotor,
        k_init=k_init,
        omega_turb_init=omega_turb,
        nu=nu,
    )


# ---------------------------------------------------------------------------
# File writers — escrevem arquivos OpenFOAM em 0/
# ---------------------------------------------------------------------------

_FOAM_HEADER = """\
FoamFile
{{
    version     2.0;
    format      ascii;
    class       {cls};
    object      {obj};
}}
"""


def write_U(
    case_dir: Path,
    op: "OperatingPoint",
    params: "RunnerGeometryParams",
) -> Path:
    """Escrever 0/U com condições de contorno de velocidade.

    - inlet: velocidade axial uniforme calculada a partir de Q e área
    - outlet: inletOutlet (recirculação livre)
    - walls (rotor): movingWallVelocity (paredes que giram com o MRF)
    - walls (stator): noSlip

    Returns
    -------
    Path
        Caminho do arquivo escrito.
    """
    import math

    d1 = params.d1
    d1h = params.d1_hub
    a_inlet = math.pi / 4.0 * (d1**2 - d1h**2)
    u_inlet = op.flow_rate / max(a_inlet, 1e-9)

    content = _FOAM_HEADER.format(cls="volVectorField", obj="U")
    content += f"""
dimensions      [0 1 -1 0 0 0 0];

internalField   uniform (0 0 {u_inlet:.6f});

boundaryField
{{
    inlet
    {{
        type            fixedValue;
        value           uniform (0 0 {u_inlet:.6f});
    }}

    outlet
    {{
        type            inletOutlet;
        inletValue      uniform (0 0 0);
        value           uniform (0 0 0);
    }}

    rotorWalls
    {{
        type            movingWallVelocity;
        value           uniform (0 0 0);
    }}

    statorWalls
    {{
        type            noSlip;
    }}

    rotatingZone_to_stator
    {{
        type            cyclicAMI;
        value           uniform (0 0 0);
    }}
}}
"""
    path = case_dir / "0" / "U"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def write_p(case_dir: Path) -> Path:
    """Escrever 0/p com condição de pressão manométrica.

    - inlet: zeroGradient
    - outlet: fixedValue uniform 0 (pressão de referência)
    - walls: zeroGradient
    """
    content = _FOAM_HEADER.format(cls="volScalarField", obj="p")
    content += """
dimensions      [0 2 -2 0 0 0 0];

internalField   uniform 0;

boundaryField
{
    inlet
    {
        type            zeroGradient;
    }

    outlet
    {
        type            fixedValue;
        value           uniform 0;
    }

    rotorWalls
    {
        type            zeroGradient;
    }

    statorWalls
    {
        type            zeroGradient;
    }

    rotatingZone_to_stator
    {
        type            cyclicAMI;
        value           uniform 0;
    }
}
"""
    path = case_dir / "0" / "p"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def write_k(
    case_dir: Path,
    turbulence_intensity: float = 0.05,
    u_ref: float = 5.0,
) -> Path:
    """Escrever 0/k (energia cinética turbulenta).

    k = 1.5 * (U * I)^2  onde I = turbulence_intensity

    Parameters
    ----------
    case_dir : Path
    turbulence_intensity : float
        Intensidade turbulenta (fração da velocidade de referência).
    u_ref : float
        Velocidade de referência [m/s] para cálculo de k na inlet.
    """
    k_val = 1.5 * (u_ref * turbulence_intensity) ** 2
    k_val = max(k_val, 1e-8)

    content = _FOAM_HEADER.format(cls="volScalarField", obj="k")
    content += f"""
dimensions      [0 2 -2 0 0 0 0];

internalField   uniform {k_val:.8e};

boundaryField
{{
    inlet
    {{
        type            turbulentIntensityKineticEnergyInlet;
        intensity       {turbulence_intensity:.4f};
        value           uniform {k_val:.8e};
    }}

    outlet
    {{
        type            inletOutlet;
        inletValue      uniform {k_val:.8e};
        value           uniform {k_val:.8e};
    }}

    rotorWalls
    {{
        type            kqRWallFunction;
        value           uniform {k_val:.8e};
    }}

    statorWalls
    {{
        type            kqRWallFunction;
        value           uniform {k_val:.8e};
    }}

    rotatingZone_to_stator
    {{
        type            cyclicAMI;
        value           uniform {k_val:.8e};
    }}
}}
"""
    path = case_dir / "0" / "k"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def write_epsilon(
    case_dir: Path,
    turbulence_intensity: float = 0.05,
    u_ref: float = 5.0,
    length_scale: float = 0.01,
) -> Path:
    """Escrever 0/epsilon (taxa de dissipação turbulenta).

    epsilon = C_mu^0.75 * k^1.5 / L
    """
    c_mu = 0.09
    k_val = 1.5 * (u_ref * turbulence_intensity) ** 2
    k_val = max(k_val, 1e-8)
    l_eff = max(length_scale, 1e-4)
    eps_val = c_mu**0.75 * k_val**1.5 / l_eff
    eps_val = max(eps_val, 1e-10)

    content = _FOAM_HEADER.format(cls="volScalarField", obj="epsilon")
    content += f"""
dimensions      [0 2 -3 0 0 0 0];

internalField   uniform {eps_val:.8e};

boundaryField
{{
    inlet
    {{
        type            turbulentMixingLengthDissipationRateInlet;
        mixingLength    {l_eff:.6f};
        value           uniform {eps_val:.8e};
    }}

    outlet
    {{
        type            inletOutlet;
        inletValue      uniform {eps_val:.8e};
        value           uniform {eps_val:.8e};
    }}

    rotorWalls
    {{
        type            epsilonWallFunction;
        value           uniform {eps_val:.8e};
    }}

    statorWalls
    {{
        type            epsilonWallFunction;
        value           uniform {eps_val:.8e};
    }}

    rotatingZone_to_stator
    {{
        type            cyclicAMI;
        value           uniform {eps_val:.8e};
    }}
}}
"""
    path = case_dir / "0" / "epsilon"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def write_omega(
    case_dir: Path,
    turbulence_intensity: float = 0.05,
    u_ref: float = 5.0,
    length_scale: float = 0.01,
) -> Path:
    """Escrever 0/omega (taxa de dissipação específica) para k-ω SST.

    omega = k^0.5 / (C_mu^0.25 * L)
    """
    c_mu = 0.09
    k_val = max(1.5 * (u_ref * turbulence_intensity) ** 2, 1e-8)
    l_eff = max(length_scale, 1e-4)
    omega_val = max(k_val ** 0.5 / (c_mu ** 0.25 * l_eff), 1e-6)

    content = _FOAM_HEADER.format(cls="volScalarField", obj="omega")
    content += f"""
dimensions      [0 0 -1 0 0 0 0];

internalField   uniform {omega_val:.8e};

boundaryField
{{
    inlet
    {{
        type            turbulentMixingLengthFrequencyInlet;
        mixingLength    {l_eff:.6f};
        value           uniform {omega_val:.8e};
    }}

    outlet
    {{
        type            inletOutlet;
        inletValue      uniform {omega_val:.8e};
        value           uniform {omega_val:.8e};
    }}

    rotorWalls
    {{
        type            omegaWallFunction;
        value           uniform {omega_val:.8e};
    }}

    statorWalls
    {{
        type            omegaWallFunction;
        value           uniform {omega_val:.8e};
    }}

    rotatingZone_to_stator
    {{
        type            cyclicAMI;
        value           uniform {omega_val:.8e};
    }}
}}
"""
    path = case_dir / "0" / "omega"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def write_nut(case_dir: Path) -> Path:
    """Escrever 0/nut (viscosidade turbulenta calculada pelo modelo).

    Na maioria dos casos, nut é calculado internamente pelo solver;
    o arquivo em 0/ define as condições de parede.
    """
    content = _FOAM_HEADER.format(cls="volScalarField", obj="nut")
    content += """
dimensions      [0 2 -1 0 0 0 0];

internalField   uniform 0;

boundaryField
{
    inlet
    {
        type            calculated;
        value           uniform 0;
    }

    outlet
    {
        type            calculated;
        value           uniform 0;
    }

    rotorWalls
    {
        type            nutkWallFunction;
        value           uniform 0;
    }

    statorWalls
    {
        type            nutkWallFunction;
        value           uniform 0;
    }

    rotatingZone_to_stator
    {
        type            cyclicAMI;
        value           uniform 0;
    }
}
"""
    path = case_dir / "0" / "nut"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def generate_mrf_properties(
    omega: float,
    axis: tuple[float, float, float] = (0, 0, 1),
    origin: tuple[float, float, float] = (0, 0, 0),
    cell_zone: str = "rotor",
    non_rotating_patches: list[str] | None = None,
) -> str:
    """Generate MRFProperties file content.

    Args:
        omega: Angular velocity [rad/s].
        axis: Rotation axis (default Z-axis).
        origin: Center of rotation.
        cell_zone: Name of the rotating cell zone.
        non_rotating_patches: Patches excluded from rotation.

    Returns:
        MRFProperties file content.
    """
    if non_rotating_patches is None:
        non_rotating_patches = ["inlet", "outlet"]

    patches_str = "\n            ".join(non_rotating_patches)

    return f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      MRFProperties;
}}

MRF1
{{
    cellZone    {cell_zone};
    active      yes;

    nonRotatingPatches ({patches_str});

    origin      ({origin[0]} {origin[1]} {origin[2]});
    axis        ({axis[0]} {axis[1]} {axis[2]});
    omega       {omega:.6f};
}}
"""
