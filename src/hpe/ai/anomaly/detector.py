"""Statistical anomaly detection for pump design data.

Uses Isolation Forest to identify unusual designs or results
that may indicate errors, novel design regions, or data quality issues.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest

from hpe.ai.surrogate.dataset import SurrogateDataset
from hpe.ai.surrogate.model import SurrogateModel


@dataclass
class AnomalyReport:
    """Report of anomaly detection on a dataset."""

    anomaly_indices: list[int]  # Indices of anomalous samples
    anomaly_scores: list[float]  # Score per sample (-1 = anomaly, +1 = normal)
    n_anomalies: int
    contamination_ratio: float  # Fraction of anomalies detected


def detect_anomalies(
    dataset: SurrogateDataset,
    contamination: float = 0.05,
    random_state: int = 42,
) -> AnomalyReport:
    """Detect anomalous designs in a dataset using Isolation Forest.

    Anomalies are designs that are statistically unusual in the
    joint space of design variables and objectives.

    Args:
        dataset: SurrogateDataset with X (features) and y (targets).
        contamination: Expected fraction of anomalies (0.01-0.10).
        random_state: Random seed.

    Returns:
        AnomalyReport with indices and scores.
    """
    # Combine features and targets for joint analysis
    data = np.hstack([dataset.X, dataset.y])

    # Filter out infeasible (penalty) samples
    mask = dataset.y[:, 0] > 0  # efficiency > 0
    data_clean = data[mask]

    if len(data_clean) < 10:
        return AnomalyReport(
            anomaly_indices=[],
            anomaly_scores=[],
            n_anomalies=0,
            contamination_ratio=0.0,
        )

    clf = IsolationForest(
        contamination=contamination,
        random_state=random_state,
        n_estimators=100,
    )
    labels = clf.fit_predict(data_clean)
    scores = clf.decision_function(data_clean).tolist()

    # Map back to original indices
    original_indices = np.where(mask)[0]
    anomaly_indices = [int(original_indices[i]) for i, l in enumerate(labels) if l == -1]

    return AnomalyReport(
        anomaly_indices=anomaly_indices,
        anomaly_scores=scores,
        n_anomalies=len(anomaly_indices),
        contamination_ratio=len(anomaly_indices) / len(data_clean),
    )


def check_prediction_confidence(
    model: SurrogateModel,
    design_vector: list[float],
) -> float:
    """Estimate prediction confidence using ensemble variance.

    For RandomForest, each tree gives a different prediction.
    High variance between trees = low confidence = possible anomaly.

    Args:
        model: Trained SurrogateModel.
        design_vector: Design to check.

    Returns:
        Confidence score (0 = no confidence, 1 = high confidence).
    """
    if not model.is_trained:
        return 0.0

    X = np.array([design_vector])

    # Access individual tree predictions
    base_model = model.model  # MultiOutputRegressor
    estimators = base_model.estimators_  # One per target

    variances = []
    for est in estimators:
        # Get predictions from each tree in the forest
        rf = est  # RandomForestRegressor
        tree_preds = np.array([tree.predict(X)[0] for tree in rf.estimators_])
        # Coefficient of variation = std / mean
        mean_pred = np.mean(tree_preds)
        std_pred = np.std(tree_preds)
        cv = std_pred / abs(mean_pred) if abs(mean_pred) > 1e-10 else 1.0
        variances.append(cv)

    # Average CV across objectives
    mean_cv = np.mean(variances)

    # Convert to confidence: low CV = high confidence
    # CV < 0.05 → ~1.0 confidence, CV > 0.5 → ~0.0
    confidence = max(0.0, min(1.0, 1.0 - 2.0 * mean_cv))
    return float(confidence)
