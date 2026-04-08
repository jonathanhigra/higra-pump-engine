"""HPE Optimization — Multi-objective design optimization with AI acceleration.

Fase 1 API (unchanged):
    from hpe.optimization import run_optimization

Fase 3 API (new):
    from hpe.optimization import (
        OptimizationProblem, DesignPoint,
        run_nsga2, NSGAResult,
        run_bayesian, BayesianResult,
    )

Usage — Fase 3:
    problem = OptimizationProblem.default(flow_rate=0.05, head=30.0, rpm=1750)
    result = run_nsga2(problem, pop_size=40, n_gen=50)
    print(f"Pareto: {len(result.pareto_front)} solutions, HV={result.hypervolume:.4f}")
"""

# Fase 1 (legacy — preserved for backward compatibility)
from hpe.optimization.optimizer import run_optimization

# Fase 3 — typed problem and result containers
from hpe.optimization.problem import OptimizationProblem
from hpe.optimization.surrogate_opt import (
    DesignPoint,
    ObjectiveValues,
    NSGAResult,
    BayesianResult,
    run_nsga2,
    run_bayesian,
    run_surrogate_assisted,
)

__all__ = [
    # Fase 1
    "run_optimization",
    # Fase 3 — problem
    "OptimizationProblem",
    "DesignPoint",
    "ObjectiveValues",
    # Fase 3 — NSGA-II
    "run_nsga2",
    "NSGAResult",
    # Fase 3 — Bayesian
    "run_bayesian",
    "BayesianResult",
    # Fase 3 — surrogate-assisted
    "run_surrogate_assisted",
]
