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
        write_nut,
    )

    created["0/U"] = write_U(case_dir, op, params)
    created["0/p"] = write_p(case_dir)
    created["0/k"] = write_k(case_dir, turbulence_intensity=0.05)
    created["0/epsilon"] = write_epsilon(case_dir)
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
        case_dir, model="kEpsilon"
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
    from hpe.cfd.mesh.snappy import (
        write_block_mesh_dict,
        write_snappy_hex_mesh_dict,
    )

    created["system/controlDict"] = write_control_dict(case_dir, n_iter=500)
    created["system/fvSchemes"] = write_fv_schemes(case_dir)
    created["system/fvSolution"] = write_fv_solution(case_dir)
    created["system/blockMeshDict"] = write_block_mesh_dict(
        case_dir, d2=params.d2, domain_factor=3.0
    )
    created["system/snappyHexMeshDict"] = write_snappy_hex_mesh_dict(
        case_dir,
        stl_file="runner.stl",
        refinement_level=(2, 3),
        n_surface_layers=5,
    )

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
