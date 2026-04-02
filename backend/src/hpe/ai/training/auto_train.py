"""Automatic surrogate model training from accumulated sizing data.

Collects sizing results stored in the database, trains a surrogate
model, and exports it for fast prediction. Can be triggered manually
or scheduled via Celery periodic task.

Pipeline:
    1. Query sizing_results + performance_data from DB
    2. Build feature matrix (Q, H, rpm, Nq → eta, NPSH, D2)
    3. Train RandomForest regressor
    4. Evaluate on holdout set
    5. Save model artifact (pickle/joblib)

References:
    - HPE AI module: hpe.ai.surrogate
"""

from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class TrainingResult:
    """Result of an auto-training run."""

    n_samples: int
    n_features: int
    n_targets: int
    r2_scores: dict[str, float]  # Target name → R² score
    model_path: str | None
    success: bool
    message: str


def train_surrogate_from_data(
    data: list[dict],
    model_dir: str = "output/models",
    test_fraction: float = 0.2,
) -> TrainingResult:
    """Train a surrogate model from a list of sizing result dicts.

    Each dict should have: flow_rate, head, rpm, estimated_efficiency,
    estimated_power, estimated_npsh_r, impeller_d2.

    Args:
        data: List of result dicts (from DB query or manual collection).
        model_dir: Directory to save the trained model.
        test_fraction: Fraction of data for testing.

    Returns:
        TrainingResult with metrics and model path.
    """
    if len(data) < 10:
        return TrainingResult(
            n_samples=len(data), n_features=0, n_targets=0,
            r2_scores={}, model_path=None, success=False,
            message=f"Need at least 10 samples, got {len(data)}",
        )

    try:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.model_selection import train_test_split
    except ImportError:
        return TrainingResult(
            n_samples=len(data), n_features=0, n_targets=0,
            r2_scores={}, model_path=None, success=False,
            message="scikit-learn not installed",
        )

    # Build feature matrix
    features = ["flow_rate", "head", "rpm"]
    targets = ["estimated_efficiency", "estimated_power", "estimated_npsh_r", "impeller_d2"]

    X = np.array([[d.get(f, 0) for f in features] for d in data])
    Y = {t: np.array([d.get(t, 0) for d in data]) for t in targets}

    # Split
    idx = np.arange(len(data))
    idx_train, idx_test = train_test_split(idx, test_size=test_fraction, random_state=42)

    X_train = X[idx_train]
    X_test = X[idx_test]

    # Train one model per target
    models = {}
    r2_scores = {}

    for target_name in targets:
        y = Y[target_name]
        y_train = y[idx_train]
        y_test = y[idx_test]

        model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
        model.fit(X_train, y_train)

        r2 = model.score(X_test, y_test)
        r2_scores[target_name] = r2
        models[target_name] = model

    # Save models
    Path(model_dir).mkdir(parents=True, exist_ok=True)
    model_path = os.path.join(model_dir, "surrogate_models.pkl")
    with open(model_path, "wb") as f:
        pickle.dump({"models": models, "features": features, "targets": targets}, f)

    return TrainingResult(
        n_samples=len(data),
        n_features=len(features),
        n_targets=len(targets),
        r2_scores=r2_scores,
        model_path=model_path,
        success=True,
        message=f"Trained on {len(idx_train)} samples, tested on {len(idx_test)}",
    )


def generate_training_data(
    n_samples: int = 200,
) -> list[dict]:
    """Generate synthetic training data by running sizing over a parameter grid.

    Useful for bootstrapping the surrogate before real data is available.
    """
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    import random
    random.seed(42)

    data = []
    for _ in range(n_samples):
        q = random.uniform(0.005, 0.2)  # 18-720 m3/h
        h = random.uniform(5.0, 100.0)
        rpm = random.choice([1450, 1750, 2900, 3500])

        try:
            op = OperatingPoint(flow_rate=q, head=h, rpm=rpm)
            result = run_sizing(op)
            data.append({
                "flow_rate": q,
                "head": h,
                "rpm": rpm,
                "estimated_efficiency": result.estimated_efficiency,
                "estimated_power": result.estimated_power,
                "estimated_npsh_r": result.estimated_npsh_r,
                "impeller_d2": result.impeller_d2,
            })
        except Exception:
            continue

    return data
