"""Extração de performance de resultados OpenFOAM — Fase 2 CFD Pipeline.

Parseia os arquivos postProcessing/ gerados pelo MRFSimpleFoam para
extrair H, Q, η e P_shaft, além dos resíduos de convergência.

Usage
-----
    from hpe.cfd.results.extract import extract_performance, parse_residuals
    from hpe.core.models import OperatingPoint

    op = OperatingPoint(flow_rate=0.05, head=30, rpm=1750)
    perf = extract_performance("./cases/pump_01", op)
    print(perf.H, perf.eta_total, perf.converged)

    residuals = parse_residuals("./cases/pump_01")
    print(residuals["p"][-10:])  # últimos 10 resíduos de pressão
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Union

from hpe.core.models import OperatingPoint

log = logging.getLogger(__name__)

# Constantes físicas
_RHO = 998.2       # kg/m³ — água a 20°C
_G = 9.80665       # m/s²


# ---------------------------------------------------------------------------
# Dataclass de resultado
# ---------------------------------------------------------------------------


@dataclass
class CfdPerformance:
    """Métricas de performance extraídas de resultados OpenFOAM.

    Attributes
    ----------
    H : float
        Altura manométrica total [m].
    Q : float
        Vazão volumétrica [m³/s].
    eta_total : float
        Eficiência total (0–1). Calculada como rho*g*Q*H / P_shaft.
    P_shaft : float
        Potência no eixo [W].
    n_rpm : float
        Velocidade de rotação [rpm] — copiada do OperatingPoint.
    converged : bool
        True se a simulação convergiu (residuais abaixo do critério).
    n_iterations : int
        Número de iterações executadas.
    """

    H: float
    Q: float
    eta_total: float
    P_shaft: float
    n_rpm: float
    converged: bool
    n_iterations: int


# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------


def extract_performance(
    case_dir: Union[str, Path],
    op: OperatingPoint,
) -> CfdPerformance:
    """Parsear postProcessing/ para extrair H, Q, η e P_shaft.

    Tenta ler os seguintes arquivos (gerados pelos functionObjects do controlDict):
      - postProcessing/forces/<time>/force.dat → torque → P_shaft
      - postProcessing/flowRateInlet/<time>/surfaceFieldValue.dat → Q
      - postProcessing/pressureAvgInlet/<time>/surfaceFieldValue.dat → p_in
      - postProcessing/pressureAvgOutlet/<time>/surfaceFieldValue.dat → p_out

    Se os arquivos não existem (caso não rodou), retorna converged=False
    com todos os valores derivados do OperatingPoint (estimativa 1D).

    Parameters
    ----------
    case_dir : str | Path
        Raiz do caso OpenFOAM.
    op : OperatingPoint
        Ponto de operação (usado como fallback e para rpm).

    Returns
    -------
    CfdPerformance
        Métricas extraídas, ou estimativa 1D se arquivos ausentes.
    """
    case_dir = Path(case_dir)
    pp_dir = case_dir / "postProcessing"

    if not pp_dir.exists():
        log.debug("extract_performance: postProcessing/ não encontrado em %s", case_dir)
        return _fallback_performance(op)

    # Determinar último time step disponível
    last_time = _latest_time(pp_dir)
    if last_time is None:
        log.debug("extract_performance: nenhum time step encontrado em postProcessing/")
        return _fallback_performance(op)

    # Extrair Q
    Q = _read_flow_rate(pp_dir, last_time)

    # Extrair ΔP e calcular H
    p_in = _read_scalar(pp_dir, "pressureAvgInlet", last_time, col=1)
    p_out = _read_scalar(pp_dir, "pressureAvgOutlet", last_time, col=1)
    delta_p = p_out - p_in  # OpenFOAM p é pressão/rho por padrão
    H = abs(delta_p) / _G  # converte m²/s² → m

    # Extrair P_shaft via torque
    omega = op.rpm * math.pi / 30.0
    torque = _read_torque(pp_dir, last_time)
    P_shaft = abs(torque * omega)

    # Fallback se leitura falhou
    if Q <= 0:
        Q = op.flow_rate
    if H <= 0:
        H = op.head
    if P_shaft <= 0:
        # Estimar: P = rho*g*Q*H / eta_estimada
        P_shaft = _RHO * _G * Q * H / 0.75

    # Calcular η
    hydraulic_power = _RHO * _G * Q * H
    eta = hydraulic_power / P_shaft if P_shaft > 0 else 0.0
    eta = max(0.0, min(1.0, eta))

    # Verificar convergência pelos resíduos
    n_iter, converged = _check_convergence(case_dir)

    log.info(
        "extract_performance: H=%.2fm  Q=%.4fm³/s  η=%.1f%%  P=%.1fkW  converged=%s  iter=%d",
        H, Q, eta * 100, P_shaft / 1000, converged, n_iter,
    )

    return CfdPerformance(
        H=H,
        Q=Q,
        eta_total=eta,
        P_shaft=P_shaft,
        n_rpm=op.rpm,
        converged=converged,
        n_iterations=n_iter,
    )


# ---------------------------------------------------------------------------
# parse_residuals
# ---------------------------------------------------------------------------


def parse_residuals(case_dir: Union[str, Path]) -> dict[str, list[float]]:
    """Parsear log.MRFSimpleFoam para extrair histórico de resíduos.

    Parameters
    ----------
    case_dir : str | Path
        Raiz do caso OpenFOAM.

    Returns
    -------
    dict[str, list[float]]
        Mapeamento variável → lista de resíduos iniciais por iteração.
        Variáveis típicas: 'Ux', 'Uy', 'Uz', 'p', 'k', 'epsilon'.
        Retorna dict vazio se o arquivo de log não existe.
    """
    case_dir = Path(case_dir)

    # Tentar diferentes nomes de log
    log_candidates = [
        case_dir / "log.MRFSimpleFoam",
        case_dir / "log.simpleFoam",
        case_dir / "log",
    ]
    log_file = None
    for candidate in log_candidates:
        if candidate.exists():
            log_file = candidate
            break

    if log_file is None:
        return {}

    residuals: dict[str, list[float]] = {}

    # Padrão: "Solving for Ux, Initial residual = 0.1234,"
    pattern = re.compile(
        r"Solving for\s+(\w+),\s+Initial residual\s*=\s*([\d.e+\-]+)"
    )

    try:
        text = log_file.read_text(encoding="utf-8", errors="replace")
        for m in pattern.finditer(text):
            var = m.group(1)
            val_str = m.group(2)
            try:
                val = float(val_str)
            except ValueError:
                continue
            if var not in residuals:
                residuals[var] = []
            residuals[var].append(val)
    except Exception as exc:
        log.warning("parse_residuals: erro ao ler %s — %s", log_file, exc)

    return residuals


# ---------------------------------------------------------------------------
# Helpers privados
# ---------------------------------------------------------------------------


def _latest_time(pp_dir: Path) -> str | None:
    """Encontrar o último time step em qualquer subdiretório de postProcessing."""
    times: list[float] = []
    for subdir in pp_dir.iterdir():
        if not subdir.is_dir():
            continue
        for time_dir in subdir.iterdir():
            if not time_dir.is_dir():
                continue
            try:
                t = float(time_dir.name)
                times.append(t)
            except ValueError:
                pass
    if not times:
        return None
    return str(max(times))


def _read_flow_rate(pp_dir: Path, last_time: str) -> float:
    """Ler vazão de postProcessing/flowRateInlet/<time>/surfaceFieldValue.dat."""
    candidates = [
        pp_dir / "flowRateInlet" / last_time / "surfaceFieldValue.dat",
        pp_dir / "flowRate" / last_time / "phi.dat",
    ]
    for path in candidates:
        val = _read_last_value(path, col=1)
        if val is not None:
            return abs(val)
    return 0.0


def _read_torque(pp_dir: Path, last_time: str) -> float:
    """Ler torque de postProcessing/forces/<time>/force.dat.

    O arquivo forces.dat tem colunas:
    time  Fx Fy Fz  Mx My Mz  (momentos em torno de CofR)
    Retorna Mz (torque no eixo Z).
    """
    candidates = [
        pp_dir / "forces" / last_time / "force.dat",
        pp_dir / "forces" / last_time / "forces.dat",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            lines = [
                l for l in path.read_text().splitlines()
                if l.strip() and not l.strip().startswith("#")
            ]
            if not lines:
                continue
            last = lines[-1].split()
            # Formato típico: time (Fx Fy Fz) (Mx My Mz) (px py pz) (tx ty tz)
            # Buscamos Mz (coluna 6 se índice 0-based, após time)
            # Tentar parsear último valor não-zero
            vals = []
            for tok in last:
                tok_clean = tok.replace("(", "").replace(")", "")
                try:
                    vals.append(float(tok_clean))
                except ValueError:
                    pass
            if len(vals) >= 7:
                return abs(vals[6])  # Mz
        except Exception:
            pass
    return 0.0


def _read_scalar(
    pp_dir: Path,
    func_name: str,
    last_time: str,
    col: int = 1,
) -> float:
    """Ler escalar de postProcessing/<func_name>/<last_time>/surfaceFieldValue.dat."""
    path = pp_dir / func_name / last_time / "surfaceFieldValue.dat"
    val = _read_last_value(path, col=col)
    return val if val is not None else 0.0


def _read_last_value(path: Path, col: int = 1) -> float | None:
    """Ler o valor da última linha de um arquivo de dados tabulados."""
    if not path.exists():
        return None
    try:
        lines = [
            l for l in path.read_text().splitlines()
            if l.strip() and not l.strip().startswith("#")
        ]
        if not lines:
            return None
        last = lines[-1].split()
        return float(last[col])
    except (IndexError, ValueError):
        return None


def _check_convergence(case_dir: Path) -> tuple[int, bool]:
    """Verificar convergência via resíduos do log.

    Returns
    -------
    tuple[int, bool]
        (número_de_iterações, convergiu)
    """
    residuals = parse_residuals(case_dir)
    if not residuals:
        return 0, False

    # Contar iterações
    n_iter = max(len(v) for v in residuals.values()) if residuals else 0

    # Convergiu se o último resíduo de p < 1e-4
    p_res = residuals.get("p", [])
    if p_res and p_res[-1] < 1e-4:
        return n_iter, True

    # Alternativa: verificar U
    ux_res = residuals.get("Ux", [])
    if ux_res and ux_res[-1] < 1e-4:
        return n_iter, True

    return n_iter, False


def _fallback_performance(op: OperatingPoint) -> CfdPerformance:
    """Retornar estimativa 1D como fallback quando arquivos CFD ausentes."""
    rho = getattr(op, "fluid_density", _RHO)
    g = _G
    eta_est = 0.75  # eficiência estimada típica
    Q = op.flow_rate
    H = op.head
    P_shaft = rho * g * Q * H / eta_est

    return CfdPerformance(
        H=H,
        Q=Q,
        eta_total=eta_est,
        P_shaft=P_shaft,
        n_rpm=op.rpm,
        converged=False,
        n_iterations=0,
    )
