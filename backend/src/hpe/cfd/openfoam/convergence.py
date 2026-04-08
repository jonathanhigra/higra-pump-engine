"""Monitoramento adaptativo de convergência OpenFOAM — Fase 12.

Monitora resíduos em tempo real (tail do log), detecta convergência
antecipada e divergência, e pode emitir sinal de parada ao solver.

Usage
-----
    from hpe.cfd.openfoam.convergence import ConvergenceMonitor, ConvergenceCriteria

    criteria = ConvergenceCriteria(tol=1e-4, window=20, divergence_factor=10.0)
    monitor = ConvergenceMonitor(case_dir, criteria)

    # Em loop após cada iteração do solver:
    status = monitor.update()
    if status.should_stop:
        print(status.reason)
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# Regex para linha de resíduo no log do OpenFOAM
# Ex: "smoothSolver:  Solving for Ux, Initial residual = 0.00123, ..."
_RE_RESIDUAL = re.compile(
    r"Solving for (\w+),\s+Initial residual = ([\d.eE+\-]+)"
)
# Ex: "Time = 150"
_RE_TIME = re.compile(r"^Time = (\d+)")


class StopReason(Enum):
    CONVERGED = "converged"
    DIVERGED = "diverged"
    MAX_ITER = "max_iterations"
    STALLED = "stalled"
    RUNNING = "running"


@dataclass
class ConvergenceCriteria:
    """Critérios de parada para o monitor de convergência.

    Attributes
    ----------
    tol : float
        Tolerância de resíduo para todas as variáveis (padrão 1e-4).
    window : int
        Número de iterações recentes para avaliar tendência.
    divergence_factor : float
        Se resíduo aumentar mais que este fator em ``window`` iterações,
        considera divergência.
    stall_factor : float
        Se a redução de resíduo for < stall_factor × tol em ``window``
        iterações, considera estagnação (solver preso).
    fields : list[str]
        Campos que devem convergir.  Default: p, Ux, Uy, Uz, k, epsilon.
    check_interval : int
        Verificar a cada N iterações (evita I/O excessivo).
    """
    tol: float = 1e-4
    window: int = 20
    divergence_factor: float = 100.0
    stall_factor: float = 0.01
    fields: list[str] = field(
        default_factory=lambda: ["p", "Ux", "Uy", "Uz", "k", "epsilon", "omega"]
    )
    check_interval: int = 10


@dataclass
class ConvergenceStatus:
    """Estado atual da convergência.

    Attributes
    ----------
    iteration : int
        Última iteração analisada.
    residuals : dict[str, float]
        Último resíduo de cada campo.
    converged_fields : set[str]
        Campos já abaixo da tolerância.
    should_stop : bool
        True se o solver deve ser interrompido.
    reason : StopReason
        Motivo da parada (ou RUNNING se ainda em andamento).
    message : str
        Descrição legível do estado.
    """
    iteration: int = 0
    residuals: dict[str, float] = field(default_factory=dict)
    converged_fields: set[str] = field(default_factory=set)
    should_stop: bool = False
    reason: StopReason = StopReason.RUNNING
    message: str = "Running"


class ConvergenceMonitor:
    """Monitor de convergência baseado no log do MRFSimpleFoam.

    Lê o arquivo ``log.MRFSimpleFoam`` do caso OpenFOAM, extrai resíduos
    por iteração e decide se o solver deve parar (convergência, divergência
    ou estagnação).

    Parameters
    ----------
    case_dir : Path
        Raiz do caso OpenFOAM.
    criteria : ConvergenceCriteria
        Critérios de parada.
    log_name : str
        Nome do arquivo de log (relativo a case_dir).
    """

    def __init__(
        self,
        case_dir: Path,
        criteria: Optional[ConvergenceCriteria] = None,
        log_name: str = "log.MRFSimpleFoam",
    ) -> None:
        self.case_dir = Path(case_dir)
        self.criteria = criteria or ConvergenceCriteria()
        self.log_path = self.case_dir / log_name
        # Histórico: campo → lista de resíduos por iteração
        self._history: dict[str, list[float]] = {}
        self._current_iter = 0
        self._last_checked_iter = 0

    # ── API pública ──────────────────────────────────────────────────────────

    def update(self) -> ConvergenceStatus:
        """Ler log e retornar status atualizado.

        Pode ser chamado a qualquer momento; lê apenas novas linhas desde
        a última chamada.
        """
        if not self.log_path.exists():
            return ConvergenceStatus(message="Log file not found yet")

        self._parse_log()

        if self._current_iter - self._last_checked_iter < self.criteria.check_interval:
            return ConvergenceStatus(
                iteration=self._current_iter,
                residuals=self._latest_residuals(),
                reason=StopReason.RUNNING,
                message="Running",
            )

        self._last_checked_iter = self._current_iter
        return self._evaluate()

    def wait_for_convergence(
        self,
        poll_interval: float = 2.0,
        timeout: float = 86400.0,
    ) -> ConvergenceStatus:
        """Bloquear até convergência, divergência ou timeout.

        Útil quando o solver roda em subprocess e queremos monitorar.
        """
        t_start = time.time()
        while time.time() - t_start < timeout:
            status = self.update()
            if status.should_stop:
                return status
            time.sleep(poll_interval)

        return ConvergenceStatus(
            iteration=self._current_iter,
            residuals=self._latest_residuals(),
            should_stop=True,
            reason=StopReason.MAX_ITER,
            message=f"Timeout after {timeout:.0f}s",
        )

    def write_stop_file(self) -> None:
        """Escrever arquivo 'stopAt' para parar o solver graciosamente."""
        stop_file = self.case_dir / "system" / "stopAtFile"
        stop_file.parent.mkdir(parents=True, exist_ok=True)
        stop_file.write_text("stopAt writeNow;\n")
        log.info("ConvergenceMonitor: wrote stopAt file → %s", stop_file)

    def summary(self) -> dict:
        """Retornar resumo do histórico de resíduos."""
        return {
            "iteration": self._current_iter,
            "fields": {
                f: {
                    "last": hist[-1] if hist else None,
                    "min": min(hist) if hist else None,
                    "n_iters": len(hist),
                }
                for f, hist in self._history.items()
            },
        }

    # ── Parsing ──────────────────────────────────────────────────────────────

    def _parse_log(self) -> None:
        """Parsear (ou re-parsear) o log completo."""
        try:
            text = self.log_path.read_text(errors="replace")
        except OSError:
            return

        current_iter = 0
        iter_residuals: dict[str, float] = {}

        for line in text.splitlines():
            m_time = _RE_TIME.match(line.strip())
            if m_time:
                # Salvar resíduos do passo anterior
                if iter_residuals and current_iter > 0:
                    for field_name, res in iter_residuals.items():
                        self._history.setdefault(field_name, []).append(res)
                    iter_residuals = {}
                current_iter = int(m_time.group(1))
                self._current_iter = max(self._current_iter, current_iter)
                continue

            m_res = _RE_RESIDUAL.search(line)
            if m_res:
                field_name = m_res.group(1)
                residual = float(m_res.group(2))
                # Guardar apenas o primeiro resíduo de cada campo por iteração
                if field_name not in iter_residuals:
                    iter_residuals[field_name] = residual

        # Último passo ainda não fechado
        if iter_residuals and current_iter > 0:
            for field_name, res in iter_residuals.items():
                self._history.setdefault(field_name, []).append(res)

    # ── Avaliação ────────────────────────────────────────────────────────────

    def _evaluate(self) -> ConvergenceStatus:
        latest = self._latest_residuals()
        converged_fields: set[str] = set()

        for f, history in self._history.items():
            if not history:
                continue
            last = history[-1]
            if last < self.criteria.tol:
                converged_fields.add(f)

        # Verificar divergência: resíduo crescendo por 'window' iterações
        for f, history in self._history.items():
            if len(history) >= self.criteria.window:
                window_vals = history[-self.criteria.window:]
                if window_vals[-1] > window_vals[0] * self.criteria.divergence_factor:
                    msg = (
                        f"Divergence detected in field '{f}': "
                        f"{window_vals[0]:.2e} → {window_vals[-1]:.2e}"
                    )
                    log.warning("ConvergenceMonitor: %s", msg)
                    return ConvergenceStatus(
                        iteration=self._current_iter,
                        residuals=latest,
                        converged_fields=converged_fields,
                        should_stop=True,
                        reason=StopReason.DIVERGED,
                        message=msg,
                    )

        # Verificar convergência: todos os campos relevantes abaixo de tol
        relevant = set(self.criteria.fields) & set(self._history)
        if relevant and relevant.issubset(converged_fields):
            msg = (
                f"Converged at iter {self._current_iter}: "
                + ", ".join(f"{f}={latest.get(f, 0):.2e}" for f in sorted(relevant))
            )
            log.info("ConvergenceMonitor: %s", msg)
            return ConvergenceStatus(
                iteration=self._current_iter,
                residuals=latest,
                converged_fields=converged_fields,
                should_stop=True,
                reason=StopReason.CONVERGED,
                message=msg,
            )

        # Verificar estagnação: resíduos não melhoram
        if len(list(self._history.values())[0] if self._history else []) >= self.criteria.window * 2:
            for f, history in self._history.items():
                if f not in relevant:
                    continue
                if len(history) >= self.criteria.window:
                    early = history[-(self.criteria.window * 2): -self.criteria.window]
                    late = history[-self.criteria.window:]
                    if early and late:
                        improvement = (min(early) - min(late)) / max(min(early), 1e-20)
                        if improvement < self.criteria.stall_factor * self.criteria.tol:
                            msg = f"Stalled: field '{f}' not improving (Δ={improvement:.2e})"
                            return ConvergenceStatus(
                                iteration=self._current_iter,
                                residuals=latest,
                                converged_fields=converged_fields,
                                should_stop=True,
                                reason=StopReason.STALLED,
                                message=msg,
                            )

        return ConvergenceStatus(
            iteration=self._current_iter,
            residuals=latest,
            converged_fields=converged_fields,
            should_stop=False,
            reason=StopReason.RUNNING,
            message=f"Running (iter={self._current_iter})",
        )

    def _latest_residuals(self) -> dict[str, float]:
        return {f: h[-1] for f, h in self._history.items() if h}
