"""Model training pipeline — continuous learning and experiment tracking.

Usage:
    from hpe.ai.training import retrain_surrogate, log_training_run
"""

from hpe.ai.training.experiment import log_training_run
from hpe.ai.training.trainer import incremental_train, retrain_surrogate

__all__ = ["retrain_surrogate", "incremental_train", "log_training_run"]
