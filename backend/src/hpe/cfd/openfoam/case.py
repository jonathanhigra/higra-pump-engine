"""OpenFOAM case directory assembly — Fase 2 CFD Pipeline.

Cria a estrutura completa de um caso MRFSimpleFoam para simulação
de bomba centrífuga.

Usage
-----
    from hpe.cfd.openfoam.case import build_openfoam_case
    from pathlib import Path

    files = build_openfoam_case(params, op, Path("./cases/pump_01"))
"""

from __future__ import annotations

import logging
import math
from pathlib import Path

from hpe.core.models import OperatingPoint
from hpe.geometry.models import RunnerGeometryParams

log = logging.getLogger(__name__)


def build_openfoam_case(
    params: RunnerGeometryParams,
    op: OperatingPoint,
    case_dir: Path,
    n_procs: int = 4,
    mesh_mode: str = "snappy",
    turbulence_model: str = "kEpsilon",
) -> dict[str, Path]:
    """Criar estrutura de diretórios e arquivos do caso OpenFOAM.

    Cria 0/, constant/ e system/ com todos os arquivos necessários
    para rodar MRFSimpleFoam em modo steady-state com turbulência k-ε.

    Parameters
    ----------
    params : RunnerGeometryParams
        Parâmetros geométricos do rotor.
    op : OperatingPoint
        Ponto de operação (Q, H, rpm).
    case_dir : Path
        Diretório onde criar o caso (criado se não existir).
    n_procs : int
        Número de processadores para decomposição paralela.
    mesh_mode : str
        Estratégia de malha.  Valores aceitos:

        ``"snappy"`` (padrão)
            Malha não-estruturada gerada por snappyHexMesh.  Requer STL do
            rotor em ``constant/triSurface/runner.stl``.

        ``"structured_blade"``
            Malha hex-estruturada O-H para simulação blade-to-blade em
            passagem única.  Gerada pelo módulo
            :mod:`hpe.cfd.mesh.structured_blade` — não requer STL.

    Returns
    -------
    dict[str, Path]
        Mapeamento de nome → caminho de cada arquivo criado.
    """
    case_dir = Path(case_dir)
    created: dict[str, Path] = {}

    # Calcular angular velocity [rad/s]
    omega_rad_s = op.rpm * math.pi / 30.0

    # ------------------------------------------------------------------
    # Criar estrutura de diretórios
    # ------------------------------------------------------------------
    for subdir in ["0", "constant", "constant/triSurface", "system"]:
        (case_dir / subdir).mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # 0/ — Condições de contorno iniciais
    # ------------------------------------------------------------------
    from hpe.cfd.openfoam.boundary_conditions import (
        write_U,
        write_p,
        write_k,
        write_epsilon,
        write_omega,
        write_nut,
    )

    # Estimate reference velocity for turbulence BC sizing
    u_ref = op.flow_rate / (math.pi / 4 * params.d1 ** 2) if params.d1 > 0 else 5.0
    l_ref = params.d1 * 0.07  # 7% of inlet diameter as mixing length

    created["0/U"] = write_U(case_dir, op, params)
    created["0/p"] = write_p(case_dir)
    created["0/k"] = write_k(case_dir, turbulence_intensity=0.05, u_ref=u_ref)
    if turbulence_model == "kOmegaSST":
        created["0/omega"] = write_omega(case_dir, u_ref=u_ref, length_scale=l_ref)
    else:
        created["0/epsilon"] = write_epsilon(case_dir, u_ref=u_ref, length_scale=l_ref)
    created["0/nut"] = write_nut(case_dir)

    # ------------------------------------------------------------------
    # constant/ — Propriedades físicas e turbulência
    # ------------------------------------------------------------------
    from hpe.cfd.openfoam.solver_config import (
        write_transport_properties,
        write_turbulence_properties,
        write_mrf_properties,
    )

    created["constant/transportProperties"] = write_transport_properties(
        case_dir,
        nu=op.fluid_viscosity / op.fluid_density,
        rho=op.fluid_density,
    )
    created["constant/turbulenceProperties"] = write_turbulence_properties(
        case_dir, model=turbulence_model
    )
    created["constant/MRFProperties"] = write_mrf_properties(
        case_dir, omega_rad_s=omega_rad_s, zone_name="rotatingZone"
    )

    # ------------------------------------------------------------------
    # system/ — Controle e esquemas numéricos
    # ------------------------------------------------------------------
    from hpe.cfd.openfoam.solver_config import (
        write_control_dict,
        write_fv_schemes,
        write_fv_solution,
        write_run_script,
    )
    created["system/controlDict"] = write_control_dict(case_dir, n_iter=500)
    created["system/fvSchemes"] = write_fv_schemes(case_dir)
    created["system/fvSolution"] = write_fv_solution(case_dir, turbulence_model=turbulence_model)

    if mesh_mode == "structured_blade":
        created["system/blockMeshDict"] = _build_structured_blade_mesh(
            params, op, case_dir
        )
        log.info("build_openfoam_case: structured blade-to-blade mesh written")
    else:
        # Default: snappyHexMesh unstructured mesh
        from hpe.cfd.mesh.snappy import (
            write_block_mesh_dict,
            write_snappy_hex_mesh_dict,
        )

        created["system/blockMeshDict"] = write_block_mesh_dict(
            case_dir, d2=params.d2, domain_factor=3.0
        )
        created["system/snappyHexMeshDict"] = write_snappy_hex_mesh_dict(
            case_dir,
            stl_file="runner.stl",
            refinement_level=(2, 3),
            n_surface_layers=5,
        )
        log.info("build_openfoam_case: snappyHexMesh mesh written")

    # decomposeParDict se paralelo
    if n_procs > 1:
        created["system/decomposeParDict"] = _write_decompose_par(case_dir, n_procs)

    # ------------------------------------------------------------------
    # run.sh
    # ------------------------------------------------------------------
    created["run.sh"] = write_run_script(case_dir, n_procs=n_procs)

    log.info(
        "build_openfoam_case: %d files written to %s",
        len(created),
        case_dir,
    )
    return created


def _build_structured_blade_mesh(
    params: RunnerGeometryParams,
    op: OperatingPoint,
    case_dir: Path,
) -> Path:
    """Delegate to the structured blade-to-blade mesh generator.

    Constructs BladeProfile (PS/SS camber lines in polar coordinates) and
    MeridionalChannel from RunnerGeometryParams, then calls
    :func:`hpe.cfd.mesh.structured_blade.generate_structured_blade_mesh`.

    Returns
    -------
    Path
        Path to the written ``system/blockMeshDict``.
    """
    from hpe.geometry.models import BladeProfile, MeridionalChannel
    from hpe.cfd.mesh.structured_blade import MeshConfig, generate_structured_blade_mesh

    r1 = params.d1 / 2.0
    r2 = params.d2 / 2.0
    n_pts = 21

    # --- Build PS/SS blade profile in polar (r, theta) ---
    # Integrate wrap angle: dtheta/dr = 1 / (r * tan(beta(r)))
    # beta varies linearly from beta1 to beta2 over radial extent
    camber: list[tuple[float, float]] = []
    theta_acc = 0.0
    dr = (r2 - r1) / max(n_pts - 1, 1)
    for i in range(n_pts):
        r = r1 + i * dr
        t = i / max(n_pts - 1, 1)
        beta_rad = math.radians(params.beta1 + t * (params.beta2 - params.beta1))
        tan_b = math.tan(beta_rad) if abs(math.tan(beta_rad)) > 1e-9 else 1e-9
        if i > 0:
            theta_acc += dr / (r * tan_b)
        camber.append((r, theta_acc))

    # Half-thickness offset in theta for PS (-) and SS (+)
    half_t_rad = params.blade_thickness / (0.5 * (r1 + r2))  # approx angular half-thickness
    ps = [(r, th - half_t_rad) for r, th in camber]
    ss = [(r, th + half_t_rad) for r, th in camber]

    blade = BladeProfile(
        camber_points=camber,
        pressure_side=ps,
        suction_side=ss,
        thickness=params.blade_thickness,
    )

    # Minimal meridional channel (radial passage from inlet to outlet)
    hub_pts = [(r1 * 0.3, params.b2 * 0.5), (r2 * 0.85, 0.0)]
    shr_pts = [(r1, params.b2 * 0.5), (r2, 0.0)]
    channel = MeridionalChannel(hub_points=hub_pts, shroud_points=shr_pts)

    nu = op.fluid_viscosity / op.fluid_density
    config = MeshConfig(
        n_radial=20,
        n_theta_ps=25,
        n_theta_ss=25,
        n_span=1,
        target_yplus=30.0,
        mode="2D",
    )

    return generate_structured_blade_mesh(
        blade=blade,
        channel=channel,
        params=params,
        config=config,
        case_dir=case_dir,
        nu=nu,
        rpm=op.rpm,
        rho=op.fluid_density,
    )


def _write_decompose_par(case_dir: Path, n_procs: int) -> Path:
    """Gera system/decomposeParDict para decomposição scotch."""
    content = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      decomposeParDict;
}}

numberOfSubdomains  {n_procs};

method  scotch;

scotchCoeffs
{{
}}
"""
    path = case_dir / "system" / "decomposeParDict"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path
