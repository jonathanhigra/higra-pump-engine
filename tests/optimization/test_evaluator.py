"""Tests for fitness evaluator."""

import pytest

from hpe.optimization.evaluator import EvaluationResult, evaluate_design
from hpe.optimization.problem import OptimizationProblem


class TestEvaluateDesign:
    def test_feasible_design(self, default_problem: OptimizationProblem) -> None:
        # Baseline-like design
        result = evaluate_design([25.0, 1.0, 1.0, 7], default_problem)
        assert isinstance(result, EvaluationResult)
        assert result.feasible
        assert result.objectives["efficiency"] > 0
        assert result.objectives["npsh_r"] > 0
        assert result.objectives["robustness"] > 0

    def test_efficiency_in_range(self, default_problem: OptimizationProblem) -> None:
        result = evaluate_design([25.0, 1.0, 1.0, 7], default_problem)
        assert 0.3 < result.objectives["efficiency"] < 1.0

    def test_different_designs_different_objectives(self, default_problem: OptimizationProblem) -> None:
        r1 = evaluate_design([18.0, 0.90, 0.90, 6], default_problem)
        r2 = evaluate_design([35.0, 1.10, 1.10, 9], default_problem)
        # Different designs should give different results
        assert r1.objectives["efficiency"] != pytest.approx(r2.objectives["efficiency"], abs=0.01)

    def test_extreme_design_may_be_infeasible(self, default_problem: OptimizationProblem) -> None:
        # Very extreme design
        result = evaluate_design([15.0, 0.85, 0.80, 5], default_problem)
        # Should still return a result (feasible or not)
        assert isinstance(result, EvaluationResult)
