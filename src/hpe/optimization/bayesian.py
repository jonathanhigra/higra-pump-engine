"""Bayesian optimization via Optuna.

Single-objective optimizer that uses Gaussian Process / TPE
to efficiently explore the design space. Useful when each
evaluation is expensive (e.g., CFD-based).
"""

from __future__ import annotations

from typing import Any

import optuna

from hpe.optimization.evaluator import evaluate_design
from hpe.optimization.problem import OptimizationProblem


def run_bayesian(
    problem: OptimizationProblem,
    n_trials: int = 100,
    objective_name: str = "efficiency",
    maximize: bool = True,
    seed: int | None = None,
) -> dict[str, Any]:
    """Run Bayesian optimization for a single objective.

    Args:
        problem: Optimization problem.
        n_trials: Number of trials.
        objective_name: Which objective to optimize.
        maximize: Whether to maximize (True) or minimize (False).
        seed: Random seed.

    Returns:
        Dict with best_params, best_value, and study summary.
    """
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    sampler = optuna.samplers.TPESampler(seed=seed)
    direction = "maximize" if maximize else "minimize"
    study = optuna.create_study(direction=direction, sampler=sampler)

    def _objective(trial: optuna.Trial) -> float:
        design_vector = []
        for var in problem.variables:
            if var.is_integer:
                val = trial.suggest_int(var.name, int(var.lower), int(var.upper))
            else:
                val = trial.suggest_float(var.name, var.lower, var.upper)
            design_vector.append(float(val))

        result = evaluate_design(design_vector, problem)

        if not result.feasible:
            return -1e6 if maximize else 1e6

        return result.objectives.get(objective_name, 0.0)

    study.optimize(_objective, n_trials=n_trials)

    best = study.best_trial
    return {
        "best_params": best.params,
        "best_value": best.value,
        "n_trials": len(study.trials),
        "objective": objective_name,
    }
