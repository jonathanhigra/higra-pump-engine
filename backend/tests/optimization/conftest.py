"""Shared fixtures for optimization tests."""

import pytest

from hpe.optimization.problem import OptimizationProblem


@pytest.fixture
def default_problem() -> OptimizationProblem:
    return OptimizationProblem.default(flow_rate=0.05, head=30.0, rpm=1750)
