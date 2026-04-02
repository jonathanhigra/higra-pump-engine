"""Dataset generation for surrogate model training.

Generates training data by sampling the design space randomly
and evaluating each sample with the physics module.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

import numpy as np

from hpe.optimization.evaluator import evaluate_design
from hpe.optimization.problem import OptimizationProblem


@dataclass
class SurrogateDataset:
    """Training dataset for surrogate models."""

    X: np.ndarray  # Features: (n_samples, n_variables)
    y: np.ndarray  # Targets: (n_samples, n_objectives)
    feature_names: list[str]
    target_names: list[str]
    n_feasible: int  # Number of feasible samples


def generate_dataset(
    problem: OptimizationProblem,
    n_samples: int = 500,
    seed: int = 42,
) -> SurrogateDataset:
    """Generate a training dataset by Latin Hypercube Sampling.

    Args:
        problem: Optimization problem (defines bounds).
        n_samples: Number of samples to generate.
        seed: Random seed.

    Returns:
        SurrogateDataset with features and targets.
    """
    rng = random.Random(seed)
    np_rng = np.random.RandomState(seed)

    bounds = problem.variable_bounds()
    n_vars = problem.n_variables
    obj_names = list(problem.objectives.keys())

    # Latin Hypercube Sampling
    X_list: list[list[float]] = []
    y_list: list[list[float]] = []
    n_feasible = 0

    # Generate LHS samples
    samples = _latin_hypercube(n_samples, n_vars, np_rng)

    for i in range(n_samples):
        # Scale to bounds
        design = []
        for j in range(n_vars):
            lo, hi = bounds[j]
            val = lo + samples[i, j] * (hi - lo)
            if problem.variables[j].is_integer:
                val = round(val)
            design.append(val)

        # Evaluate
        result = evaluate_design(design, problem)

        X_list.append(design)
        y_list.append([result.objectives[name] for name in obj_names])

        if result.feasible:
            n_feasible += 1

    return SurrogateDataset(
        X=np.array(X_list),
        y=np.array(y_list),
        feature_names=[v.name for v in problem.variables],
        target_names=obj_names,
        n_feasible=n_feasible,
    )


def _latin_hypercube(n: int, d: int, rng: np.random.RandomState) -> np.ndarray:
    """Generate Latin Hypercube samples in [0, 1]^d."""
    samples = np.zeros((n, d))
    for j in range(d):
        perm = rng.permutation(n)
        for i in range(n):
            samples[i, j] = (perm[i] + rng.random()) / n
    return samples
