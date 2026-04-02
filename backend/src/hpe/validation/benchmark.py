"""Benchmark HPE predictions against test bench measurements.

Runs HPE sizing for each test bench record and compares predicted
head, efficiency, power, and NPSH against measured values. Produces
statistical metrics (MAE, RMSE, R², bias) for model validation.

The test bench data is expected in the format:
    - flow_rate [m³/s]
    - head [m]
    - rpm [rev/min]
    - measured_efficiency [-]
    - measured_power [W]
    - measured_npsh [m] (optional)

References:
    - HIGRA Industrial test bench: 4,036 records from sigs.teste_bancada
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class TestBenchPoint:
    """A single test bench measurement."""

    flow_rate: float  # Q [m³/s]
    head: float  # H [m]
    rpm: float  # n [rpm]
    measured_efficiency: float | None = None  # [-] (0-1)
    measured_power: float | None = None  # [W]
    measured_npsh: float | None = None  # [m]
    machine_model: str = ""


@dataclass
class PredictionComparison:
    """Comparison of HPE prediction vs measurement for one point."""

    flow_rate: float
    head: float
    rpm: float

    # Predicted values
    pred_efficiency: float
    pred_power: float
    pred_npsh: float
    pred_d2: float

    # Measured values
    meas_efficiency: float | None
    meas_power: float | None
    meas_npsh: float | None

    # Errors
    efficiency_error: float | None = None  # Predicted - Measured
    power_error_pct: float | None = None  # (Pred - Meas) / Meas * 100
    npsh_error: float | None = None


@dataclass
class MetricStats:
    """Statistical metrics for a set of predictions."""

    count: int
    mean_error: float  # Bias (mean of errors)
    mae: float  # Mean Absolute Error
    rmse: float  # Root Mean Square Error
    r_squared: float  # Coefficient of determination
    max_error: float  # Worst case
    within_5pct: float  # Fraction of predictions within 5%
    within_10pct: float  # Fraction within 10%


@dataclass
class BenchmarkResult:
    """Complete benchmark result comparing HPE predictions to test data."""

    n_points: int
    comparisons: list[PredictionComparison]

    efficiency_metrics: MetricStats | None = None
    power_metrics: MetricStats | None = None
    npsh_metrics: MetricStats | None = None

    warnings: list[str] = field(default_factory=list)


def benchmark_sizing(
    test_data: list[TestBenchPoint],
    skip_errors: bool = True,
) -> BenchmarkResult:
    """Run HPE sizing for each test point and compare with measurements.

    Args:
        test_data: List of test bench measurements.
        skip_errors: If True, skip points that fail sizing instead of raising.

    Returns:
        BenchmarkResult with per-point comparisons and aggregate metrics.
    """
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    comparisons: list[PredictionComparison] = []
    warnings: list[str] = []

    for pt in test_data:
        try:
            op = OperatingPoint(flow_rate=pt.flow_rate, head=pt.head, rpm=pt.rpm)
            sizing = run_sizing(op)

            # Compute errors
            eff_err = None
            if pt.measured_efficiency is not None:
                eff_err = sizing.estimated_efficiency - pt.measured_efficiency

            pwr_err = None
            if pt.measured_power is not None and pt.measured_power > 0:
                pwr_err = (sizing.estimated_power - pt.measured_power) / pt.measured_power * 100.0

            npsh_err = None
            if pt.measured_npsh is not None:
                npsh_err = sizing.estimated_npsh_r - pt.measured_npsh

            comparisons.append(PredictionComparison(
                flow_rate=pt.flow_rate,
                head=pt.head,
                rpm=pt.rpm,
                pred_efficiency=sizing.estimated_efficiency,
                pred_power=sizing.estimated_power,
                pred_npsh=sizing.estimated_npsh_r,
                pred_d2=sizing.impeller_d2,
                meas_efficiency=pt.measured_efficiency,
                meas_power=pt.measured_power,
                meas_npsh=pt.measured_npsh,
                efficiency_error=eff_err,
                power_error_pct=pwr_err,
                npsh_error=npsh_err,
            ))

        except Exception as e:
            if skip_errors:
                warnings.append(f"Skipped Q={pt.flow_rate}, H={pt.head}: {e}")
            else:
                raise

    # Aggregate metrics
    eff_metrics = _compute_metrics(
        [c.efficiency_error for c in comparisons if c.efficiency_error is not None],
        [c.meas_efficiency for c in comparisons if c.meas_efficiency is not None],
        [c.pred_efficiency for c in comparisons if c.meas_efficiency is not None],
        relative_to=1.0,  # Efficiency is already 0-1
    )

    pwr_metrics = _compute_metrics(
        [c.power_error_pct for c in comparisons if c.power_error_pct is not None],
        [c.meas_power for c in comparisons if c.meas_power is not None and c.meas_power > 0],
        [c.pred_power for c in comparisons if c.meas_power is not None and c.meas_power > 0],
        relative_to=None,  # Already percentage errors
    )

    npsh_metrics = _compute_metrics(
        [c.npsh_error for c in comparisons if c.npsh_error is not None],
        [c.meas_npsh for c in comparisons if c.meas_npsh is not None],
        [c.pred_npsh for c in comparisons if c.meas_npsh is not None],
        relative_to=None,
    )

    return BenchmarkResult(
        n_points=len(comparisons),
        comparisons=comparisons,
        efficiency_metrics=eff_metrics,
        power_metrics=pwr_metrics,
        npsh_metrics=npsh_metrics,
        warnings=warnings,
    )


def _compute_metrics(
    errors: list[float],
    measured: list[float],
    predicted: list[float],
    relative_to: float | None = None,
) -> MetricStats | None:
    """Compute statistical metrics from error lists."""
    if not errors or len(errors) < 2:
        return None

    n = len(errors)
    mean_err = sum(errors) / n
    mae = sum(abs(e) for e in errors) / n
    rmse = math.sqrt(sum(e**2 for e in errors) / n)
    max_err = max(abs(e) for e in errors)

    # R² (coefficient of determination)
    if measured and predicted and len(measured) == len(predicted):
        mean_meas = sum(measured) / len(measured)
        ss_res = sum((p - m) ** 2 for p, m in zip(predicted, measured))
        ss_tot = sum((m - mean_meas) ** 2 for m in measured)
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    else:
        r2 = 0.0

    # Fraction within thresholds
    if relative_to is not None:
        threshold_5 = 0.05 * relative_to
        threshold_10 = 0.10 * relative_to
    else:
        threshold_5 = 5.0  # 5% for percentage errors
        threshold_10 = 10.0

    within_5 = sum(1 for e in errors if abs(e) <= threshold_5) / n
    within_10 = sum(1 for e in errors if abs(e) <= threshold_10) / n

    return MetricStats(
        count=n,
        mean_error=mean_err,
        mae=mae,
        rmse=rmse,
        r_squared=r2,
        max_error=max_err,
        within_5pct=within_5,
        within_10pct=within_10,
    )
