"""Tests for surrogate AI model."""

import pytest

from hpe.ai.surrogate.dataset import SurrogateDataset, generate_dataset
from hpe.ai.surrogate.model import SurrogateModel
from hpe.ai.surrogate.predictor import SurrogatePredictor
from hpe.optimization.problem import OptimizationProblem


@pytest.fixture
def problem() -> OptimizationProblem:
    return OptimizationProblem.default(0.05, 30.0, 1750)


class TestDataset:
    def test_generates_samples(self, problem: OptimizationProblem) -> None:
        dataset = generate_dataset(problem, n_samples=30, seed=42)
        assert isinstance(dataset, SurrogateDataset)
        assert dataset.X.shape == (30, 4)
        assert dataset.y.shape == (30, 3)
        assert dataset.n_feasible > 0

    def test_feature_names(self, problem: OptimizationProblem) -> None:
        dataset = generate_dataset(problem, n_samples=10, seed=42)
        assert "beta2" in dataset.feature_names
        assert len(dataset.feature_names) == 4


class TestSurrogateModel:
    def test_train_and_predict(self, problem: OptimizationProblem) -> None:
        dataset = generate_dataset(problem, n_samples=50, seed=42)
        model = SurrogateModel()
        metrics = model.train(dataset)

        assert model.is_trained
        assert metrics.mean_r2 > -1.0  # Should learn something
        assert metrics.n_train > 0

        pred = model.predict([25.0, 1.0, 1.0, 7])
        assert "efficiency" in pred
        assert "npsh_r" in pred
        assert pred["efficiency"] > 0

    def test_predict_before_train_raises(self) -> None:
        model = SurrogateModel()
        with pytest.raises(RuntimeError):
            model.predict([25.0, 1.0, 1.0, 7])


class TestSurrogatePredictor:
    def test_build_and_predict(self, problem: OptimizationProblem) -> None:
        predictor = SurrogatePredictor(problem)
        metrics = predictor.build(n_samples=50, seed=42)

        assert predictor.is_ready
        assert metrics.mean_r2 > -1.0

        pred = predictor.predict([25.0, 1.0, 1.0, 7])
        assert pred["efficiency"] > 0
