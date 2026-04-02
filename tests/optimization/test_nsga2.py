"""Tests for NSGA-II optimizer."""

import pytest

from hpe.optimization.nsga2 import OptimizationResult, run_nsga2
from hpe.optimization.problem import OptimizationProblem


class TestNSGA2:
    def test_produces_pareto_front(self, default_problem: OptimizationProblem) -> None:
        """Small run should produce a Pareto front."""
        result = run_nsga2(default_problem, pop_size=10, n_gen=5, seed=42)
        assert isinstance(result, OptimizationResult)
        assert len(result.pareto_front) > 0
        assert result.all_evaluations > 0

    def test_pareto_designs_have_objectives(self, default_problem: OptimizationProblem) -> None:
        result = run_nsga2(default_problem, pop_size=10, n_gen=5, seed=42)
        for design in result.pareto_front:
            assert "variables" in design
            assert "objectives" in design
            assert "efficiency" in design["objectives"]
            assert "npsh_r" in design["objectives"]

    def test_best_efficiency_found(self, default_problem: OptimizationProblem) -> None:
        result = run_nsga2(default_problem, pop_size=10, n_gen=5, seed=42)
        assert result.best_efficiency is not None
        assert result.best_efficiency["objectives"]["efficiency"] > 0

    def test_reproducible_with_seed(self, default_problem: OptimizationProblem) -> None:
        r1 = run_nsga2(default_problem, pop_size=10, n_gen=3, seed=123)
        r2 = run_nsga2(default_problem, pop_size=10, n_gen=3, seed=123)
        assert r1.best_efficiency["objectives"]["efficiency"] == pytest.approx(
            r2.best_efficiency["objectives"]["efficiency"], rel=1e-6
        )

    def test_larger_run_converges(self, default_problem: OptimizationProblem) -> None:
        """Moderate run should find reasonable designs."""
        result = run_nsga2(default_problem, pop_size=20, n_gen=15, seed=42)
        best_eta = result.best_efficiency["objectives"]["efficiency"]
        assert best_eta > 0.5  # Should find decent designs
