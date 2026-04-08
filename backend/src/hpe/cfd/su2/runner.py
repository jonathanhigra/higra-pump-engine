"""Execução do SU2 (análise direta + adjoint) — Fase 14.

Orquestra a execução do SU2_CFD (análise RANS) e SU2_CFD_AD (adjoint
contínuo) para cálculo de sensibilidades de forma.

Usage
-----
    from hpe.cfd.su2.runner import run_su2_direct, run_su2_adjoint, SU2Result

    direct = run_su2_direct(config_path, mesh_path, n_procs=4)
    print(direct.converged, direct.objective)

    adjoint = run_su2_adjoint(config_path, mesh_path, direct_solution_path)
    print(adjoint.sensitivity_file)
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# Executáveis SU2 (podem ser sobrescritos via variável de ambiente)
_SU2_CFD    = os.environ.get("SU2_CFD",    "SU2_CFD")
_SU2_CFD_AD = os.environ.get("SU2_CFD_AD", "SU2_CFD_AD")
_SU2_DOT    = os.environ.get("SU2_DOT",    "SU2_DOT")


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class SU2Result:
    """Resultado de uma execução SU2.

    Attributes
    ----------
    mode : str
        "direct" ou "adjoint".
    converged : bool
        True se o solver convergiu (residual < tol).
    objective : float | None
        Valor da função objetivo (drag, total pressure loss, etc).
    residual_final : float | None
        Resíduo final do campo de densidade.
    n_iterations : int
        Número de iterações executadas.
    solution_file : Path | None
        Caminho do arquivo de solução (restart_flow.dat ou restart_adj_*.dat).
    sensitivity_file : Path | None
        Caminho do arquivo de sensibilidades (surface_sens.csv) — adjoint only.
    log_file : Path | None
        Caminho do log da execução.
    return_code : int
        Código de retorno do processo.
    errors : list[str]
        Mensagens de erro não-fatais.
    """

    mode: str
    converged: bool = False
    objective: Optional[float] = None
    residual_final: Optional[float] = None
    n_iterations: int = 0
    solution_file: Optional[Path] = None
    sensitivity_file: Optional[Path] = None
    log_file: Optional[Path] = None
    return_code: int = -1
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "mode": self.mode,
            "converged": self.converged,
            "objective": round(self.objective, 6) if self.objective is not None else None,
            "residual_final": self.residual_final,
            "n_iterations": self.n_iterations,
            "solution_file": str(self.solution_file) if self.solution_file else None,
            "sensitivity_file": str(self.sensitivity_file) if self.sensitivity_file else None,
            "return_code": self.return_code,
            "errors": self.errors,
        }


# ---------------------------------------------------------------------------
# Funções públicas
# ---------------------------------------------------------------------------

def su2_available() -> bool:
    """Verificar se SU2_CFD está instalado no PATH."""
    return shutil.which(_SU2_CFD) is not None


def run_su2_direct(
    config_path: "str | Path",
    work_dir: Optional["str | Path"] = None,
    n_procs: int = 1,
    timeout: int = 7200,
) -> SU2Result:
    """Executar SU2_CFD (análise RANS direta).

    Parameters
    ----------
    config_path : Path
        Caminho para o arquivo config.cfg do SU2.
    work_dir : Path | None
        Diretório de trabalho.  Se None, usa o diretório do config.
    n_procs : int
        Número de processos MPI.
    timeout : int
        Timeout em segundos.

    Returns
    -------
    SU2Result
        Resultado da execução.
    """
    config_path = Path(config_path)
    work_dir = Path(work_dir) if work_dir else config_path.parent
    work_dir.mkdir(parents=True, exist_ok=True)

    if not su2_available():
        return SU2Result(
            mode="direct",
            errors=[f"SU2_CFD not found in PATH (searched: {_SU2_CFD})"],
        )

    cmd = _build_cmd(_SU2_CFD, config_path, n_procs)
    log_file = work_dir / "log.SU2_direct"

    return_code, stdout = _run_subprocess(cmd, work_dir, log_file, timeout)

    result = SU2Result(mode="direct", return_code=return_code, log_file=log_file)
    _parse_su2_log(stdout, result)

    # Localizar arquivo de solução
    sol = work_dir / "restart_flow.dat"
    if sol.exists():
        result.solution_file = sol

    if return_code != 0:
        result.errors.append(f"SU2_CFD exited with code {return_code}")
    else:
        result.converged = result.residual_final is not None and result.residual_final < 1e-6

    log.info(
        "SU2 direct: converged=%s  obj=%s  iter=%d  rc=%d",
        result.converged, result.objective, result.n_iterations, return_code,
    )
    return result


def run_su2_adjoint(
    config_path: "str | Path",
    direct_solution: Optional["str | Path"] = None,
    work_dir: Optional["str | Path"] = None,
    n_procs: int = 1,
    timeout: int = 7200,
) -> SU2Result:
    """Executar SU2_CFD_AD (adjoint contínuo) para cálculo de sensibilidades.

    Parameters
    ----------
    config_path : Path
        Config com MATH_PROBLEM= CONTINUOUS_ADJOINT.
    direct_solution : Path | None
        Caminho do restart_flow.dat da execução direta.
        Se fornecido, copiado para o work_dir.
    work_dir : Path | None
        Diretório de trabalho.
    n_procs : int
        Processos MPI.
    timeout : int
        Timeout em segundos.
    """
    config_path = Path(config_path)
    work_dir = Path(work_dir) if work_dir else config_path.parent
    work_dir.mkdir(parents=True, exist_ok=True)

    if not shutil.which(_SU2_CFD_AD):
        return SU2Result(
            mode="adjoint",
            errors=[f"SU2_CFD_AD not found in PATH (searched: {_SU2_CFD_AD})"],
        )

    # Copiar solução direta se fornecida
    if direct_solution and Path(direct_solution).exists():
        shutil.copy(direct_solution, work_dir / "solution_flow.dat")

    cmd = _build_cmd(_SU2_CFD_AD, config_path, n_procs)
    log_file = work_dir / "log.SU2_adjoint"

    return_code, stdout = _run_subprocess(cmd, work_dir, log_file, timeout)

    result = SU2Result(mode="adjoint", return_code=return_code, log_file=log_file)
    _parse_su2_log(stdout, result)

    # Localizar arquivos de sensibilidade
    for name in ["surface_sens.csv", "surface_sensitivity.csv", "of_grad.dat"]:
        sens = work_dir / name
        if sens.exists():
            result.sensitivity_file = sens
            break

    sol_adj = work_dir / "restart_adj_cd.dat"
    if sol_adj.exists():
        result.solution_file = sol_adj

    if return_code != 0:
        result.errors.append(f"SU2_CFD_AD exited with code {return_code}")
    else:
        result.converged = result.residual_final is not None

    log.info(
        "SU2 adjoint: converged=%s  sens_file=%s  rc=%d",
        result.converged, result.sensitivity_file, return_code,
    )
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_cmd(executable: str, config: Path, n_procs: int) -> list[str]:
    if n_procs > 1:
        return ["mpirun", "-np", str(n_procs), executable, str(config.name)]
    return [executable, str(config.name)]


def _run_subprocess(
    cmd: list[str],
    cwd: Path,
    log_file: Path,
    timeout: int,
) -> tuple[int, str]:
    """Executar subprocesso, logar saída, retornar (return_code, stdout)."""
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        combined = proc.stdout + proc.stderr
        log_file.write_text(combined, encoding="utf-8")
        return proc.returncode, combined
    except FileNotFoundError as exc:
        return -1, str(exc)
    except subprocess.TimeoutExpired:
        return -2, f"Timeout after {timeout}s"


def _parse_su2_log(text: str, result: SU2Result) -> None:
    """Extrair metadados do log do SU2."""
    import re

    # Número de iterações
    iter_matches = re.findall(r"^\s*(\d+)\s+[\d.eE+\-]+", text, re.MULTILINE)
    if iter_matches:
        result.n_iterations = int(iter_matches[-1])

    # Resíduo final: linha "Iter[...]  rho[...]"
    res_match = re.search(r"Rho\[0\]\s*=\s*([\d.eE+\-]+)", text)
    if res_match:
        result.residual_final = float(res_match.group(1))

    # Função objetivo (drag, total pressure, etc.)
    obj_match = re.search(r"Total\s+(?:Drag|Pressure Loss)[^\d]*([\d.eE+\-]+)", text, re.IGNORECASE)
    if obj_match:
        result.objective = float(obj_match.group(1))
    else:
        # Tentar extrair CL/CD
        cd_match = re.search(r"CD\s*=\s*([\d.eE+\-]+)", text)
        if cd_match:
            result.objective = float(cd_match.group(1))
