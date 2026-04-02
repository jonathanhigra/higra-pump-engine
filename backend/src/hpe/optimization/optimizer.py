"""Unified optimization interface.

Provides a single entry point for running optimization with
different methods (NSGA-II, Bayesian).
"""

from __future__ import annotations

from typing import Any

from hpe.optimization.problem import OptimizationProblem


def run_optimization(
    problem: OptimizationProblem,
    method: str = "nsga2",
    **kwargs: Any,
) -> Any:
    """Run optimization with the specified method.

    Args:
        problem: Optimization problem.
        method: "nsga2" or "bayesian".
        **kwargs: Method-specific parameters.

    Returns:
        OptimizationResult (nsga2) or dict (bayesian).
    """
    if method == "nsga2":
        from hpe.optimization.nsga2 import run_nsga2
        return run_nsga2(problem, **kwargs)
    elif method == "bayesian":
        from hpe.optimization.bayesian import run_bayesian
        return run_bayesian(problem, **kwargs)
    else:
        raise ValueError(f"Unknown optimization method: {method}. Use 'nsga2' or 'bayesian'.")
