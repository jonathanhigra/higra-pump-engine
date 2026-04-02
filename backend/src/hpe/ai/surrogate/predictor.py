"""High-level predictor interface for surrogate-assisted optimization.

Manages model training and provides a simple predict() interface
that can replace the physics evaluator in the optimization loop.
"""

from __future__ import annotations

from typing import Optional

from hpe.ai.surrogate.dataset import SurrogateDataset, generate_dataset
from hpe.ai.surrogate.model import SurrogateMetrics, SurrogateModel
from hpe.optimization.problem import OptimizationProblem


class SurrogatePredictor:
    """Manages surrogate model lifecycle: generate data, train, predict."""

    def __init__(self, problem: OptimizationProblem) -> None:
        self.problem = problem
        self.model = SurrogateModel()
        self.dataset: Optional[SurrogateDataset] = None
        self.metrics: Optional[SurrogateMetrics] = None

    def build(self, n_samples: int = 500, seed: int = 42) -> SurrogateMetrics:
        """Generate dataset and train the surrogate model.

        Args:
            n_samples: Number of training samples.
            seed: Random seed.

        Returns:
            SurrogateMetrics with R² scores.
        """
        self.dataset = generate_dataset(self.problem, n_samples, seed)
        self.metrics = self.model.train(self.dataset)
        return self.metrics

    def predict(self, design_vector: list[float]) -> dict[str, float]:
        """Predict objectives for a design vector."""
        return self.model.predict(design_vector)

    @property
    def is_ready(self) -> bool:
        return self.model.is_trained
