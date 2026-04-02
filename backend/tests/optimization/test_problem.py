"""Tests for optimization problem definition."""

from hpe.optimization.problem import OptimizationProblem


class TestOptimizationProblem:
    def test_default_creation(self) -> None:
        problem = OptimizationProblem.default(0.05, 30.0, 1750)
        assert problem.n_variables == 4
        assert problem.n_objectives == 3

    def test_variable_bounds(self) -> None:
        problem = OptimizationProblem.default(0.05, 30.0, 1750)
        bounds = problem.variable_bounds()
        assert len(bounds) == 4
        for lo, hi in bounds:
            assert lo < hi

    def test_variable_names(self) -> None:
        problem = OptimizationProblem.default(0.05, 30.0, 1750)
        names = [v.name for v in problem.variables]
        assert "beta2" in names
        assert "blade_count" in names
