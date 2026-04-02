"""NSGA-II multi-objective optimizer via DEAP.

Finds the Pareto-optimal set of designs trading off
efficiency, cavitation, and robustness.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from deap import algorithms, base, creator, tools

from hpe.optimization.evaluator import EvaluationResult, evaluate_design
from hpe.optimization.problem import OptimizationProblem


@dataclass
class OptimizationResult:
    """Result of an optimization run."""

    pareto_front: list[dict[str, Any]]  # List of {variables, objectives, feasible}
    all_evaluations: int  # Total number of evaluations
    generations: int  # Number of generations completed
    best_efficiency: dict[str, Any] | None = None  # Best design by efficiency
    best_npsh: dict[str, Any] | None = None  # Best design by NPSH


def run_nsga2(
    problem: OptimizationProblem,
    pop_size: int = 40,
    n_gen: int = 50,
    crossover_prob: float = 0.9,
    mutation_prob: float = 0.2,
    seed: int | None = None,
) -> OptimizationResult:
    """Run NSGA-II optimization.

    Args:
        problem: Optimization problem definition.
        pop_size: Population size.
        n_gen: Number of generations.
        crossover_prob: Crossover probability.
        mutation_prob: Mutation probability per gene.
        seed: Random seed for reproducibility.

    Returns:
        OptimizationResult with Pareto front and statistics.
    """
    if seed is not None:
        random.seed(seed)

    # Setup DEAP
    # Weights: +1 for maximize, -1 for minimize
    weights = tuple(
        1.0 if maximize else -1.0
        for maximize in problem.objectives.values()
    )

    # Clean up any previous DEAP creator classes
    for name in ["FitnessMulti", "Individual"]:
        if name in creator.__dict__:
            del creator.__dict__[name]

    creator.create("FitnessMulti", base.Fitness, weights=weights)
    creator.create("Individual", list, fitness=creator.FitnessMulti)

    toolbox = base.Toolbox()

    # Register attribute generators
    bounds = problem.variable_bounds()
    for i, (lo, hi) in enumerate(bounds):
        if problem.variables[i].is_integer:
            toolbox.register(f"attr_{i}", random.randint, int(lo), int(hi))
        else:
            toolbox.register(f"attr_{i}", random.uniform, lo, hi)

    def _create_individual():
        ind = []
        for i in range(problem.n_variables):
            ind.append(toolbox.__dict__[f"attr_{i}"]())
        return creator.Individual(ind)

    toolbox.register("individual", _create_individual)
    toolbox.register("population", tools.initRepeat, list, toolbox.individual)

    # Evaluation function
    def _evaluate(individual: list[float]) -> tuple[float, ...]:
        result = evaluate_design(individual, problem)
        obj_values = tuple(result.objectives[name] for name in problem.objectives)

        # Penalty for infeasible designs
        if not result.feasible:
            return tuple(
                -1e6 if maximize else 1e6
                for maximize in problem.objectives.values()
            )
        return obj_values

    toolbox.register("evaluate", _evaluate)
    toolbox.register("mate", tools.cxSimulatedBinaryBounded,
                     low=[b[0] for b in bounds],
                     up=[b[1] for b in bounds],
                     eta=20.0)
    toolbox.register("mutate", tools.mutPolynomialBounded,
                     low=[b[0] for b in bounds],
                     up=[b[1] for b in bounds],
                     eta=20.0,
                     indpb=mutation_prob)
    toolbox.register("select", tools.selNSGA2)

    # Run
    pop = toolbox.population(n=pop_size)
    total_evals = 0

    # Evaluate initial population
    fitnesses = list(map(toolbox.evaluate, pop))
    for ind, fit in zip(pop, fitnesses):
        ind.fitness.values = fit
    total_evals += len(pop)

    # Evolution loop
    for gen in range(n_gen):
        offspring = algorithms.varAnd(pop, toolbox, crossover_prob, mutation_prob)

        # Evaluate offspring
        invalid_ind = [ind for ind in offspring if not ind.fitness.valid]
        fitnesses = list(map(toolbox.evaluate, invalid_ind))
        for ind, fit in zip(invalid_ind, fitnesses):
            ind.fitness.values = fit
        total_evals += len(invalid_ind)

        # Select next generation
        pop = toolbox.select(pop + offspring, pop_size)

    # Extract Pareto front
    pareto = tools.sortNondominated(pop, len(pop), first_front_only=True)[0]

    # Build results
    pareto_front = []
    for ind in pareto:
        result = evaluate_design(list(ind), problem)
        entry = {
            "variables": {
                problem.variables[i].name: ind[i]
                for i in range(problem.n_variables)
            },
            "objectives": result.objectives,
            "feasible": result.feasible,
        }
        pareto_front.append(entry)

    # Find best by each objective
    best_eff = max(pareto_front, key=lambda x: x["objectives"]["efficiency"])
    best_npsh = min(pareto_front, key=lambda x: x["objectives"]["npsh_r"])

    return OptimizationResult(
        pareto_front=pareto_front,
        all_evaluations=total_evals,
        generations=n_gen,
        best_efficiency=best_eff,
        best_npsh=best_npsh,
    )
