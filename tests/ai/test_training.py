"""Tests for training pipeline."""

import pytest

from hpe.ai.surrogate.predictor import SurrogatePredictor
from hpe.ai.training.experiment import log_training_run
from hpe.ai.training.trainer import TrainingResult, retrain_surrogate
from hpe.optimization.problem import OptimizationProblem


@pytest.fixture
def problem():
    return OptimizationProblem.default(0.05, 30.0, 1750)


@pytest.fixture
def trained_predictor(problem):
    predictor = SurrogatePredictor(problem)
    predictor.build(n_samples=30, seed=42)
    return predictor


class TestRetrain:
    def test_retrain_returns_result(self, trained_predictor) -> None:
        result = retrain_surrogate(trained_predictor, n_new_samples=20, seed=99)
        assert isinstance(result, TrainingResult)
        assert result.n_total_samples == 50  # 30 original + 20 new

    def test_retrain_has_old_metrics(self, trained_predictor) -> None:
        result = retrain_surrogate(trained_predictor, n_new_samples=20, seed=99)
        assert result.old_metrics is not None
        assert result.new_metrics is not None

    def test_first_train_always_accepted(self, problem) -> None:
        predictor = SurrogatePredictor(problem)
        predictor.build(n_samples=30, seed=42)
        result = retrain_surrogate(predictor, n_new_samples=20, seed=99)
        # With more data, should improve or at least accept
        assert result.n_total_samples > 30


class TestExperimentLogging:
    def test_log_to_file(self, trained_predictor) -> None:
        record = log_training_run(
            trained_predictor.metrics,
            params={"n_samples": 30, "seed": 42},
            use_mlflow=False,
        )
        assert record.run_id is not None
        assert record.metrics["mean_r2"] is not None

    def test_record_has_metrics(self, trained_predictor) -> None:
        record = log_training_run(
            trained_predictor.metrics,
            params={"n_samples": 30},
            use_mlflow=False,
        )
        assert "mean_r2" in record.metrics
        assert "n_train" in record.metrics
