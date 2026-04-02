"""Surrogate models for fast performance prediction without CFD.

Usage:
    from hpe.ai.surrogate.predictor import SurrogatePredictor
    from hpe.optimization.problem import OptimizationProblem

    problem = OptimizationProblem.default(0.05, 30.0, 1750)
    predictor = SurrogatePredictor(problem)
    metrics = predictor.build(n_samples=500)
    prediction = predictor.predict([25.0, 1.0, 1.0, 7])
"""

from hpe.ai.surrogate.predictor import SurrogatePredictor
from hpe.ai.surrogate.eta_predictor import EtaSurrogate

__all__ = ["SurrogatePredictor", "EtaSurrogate"]
