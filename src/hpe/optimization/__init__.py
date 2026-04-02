"""HPE Optimization — Multi-objective design optimization with AI acceleration.

Usage:
    from hpe.optimization import run_optimization
    from hpe.optimization.problem import OptimizationProblem

    problem = OptimizationProblem.default(flow_rate=0.05, head=30.0, rpm=1750)
    result = run_optimization(problem, method="nsga2", pop_size=40, n_gen=50)
"""

from hpe.optimization.optimizer import run_optimization

__all__ = ["run_optimization"]
