"""Performance curve generation (H-Q, eta-Q, P-Q, NPSH-Q).

Generates complete pump performance curves by evaluating the physics
model at multiple flow rates. These curves are essential for:
- Selecting operating points
- System curve matching
- Off-design performance assessment
- Optimization robustness evaluation
"""

from __future__ import annotations

from dataclasses import dataclass, field

from hpe.core.models import PerformanceMetrics, SizingResult
from hpe.physics.euler import get_design_flow_rate
from hpe.physics.performance import evaluate_performance


@dataclass
class PerformanceCurves:
    """Complete set of performance curves for a pump.

    All lists are indexed the same way — curves[i] corresponds to
    flow_rates[i].
    """

    flow_rates: list[float]  # Q [m^3/s]
    heads: list[float]  # H [m]
    efficiencies: list[float]  # eta_total [-]
    powers: list[float]  # P [W]
    npsh_required: list[float]  # NPSHr [m]
    hydraulic_efficiencies: list[float]  # eta_h [-]
    torques: list[float]  # T [N.m]
    metrics: list[PerformanceMetrics] = field(default_factory=list)


def generate_curves(
    sizing: SizingResult,
    q_min_ratio: float = 0.1,
    q_max_ratio: float = 1.5,
    n_points: int = 25,
    rho: float = 998.2,
) -> PerformanceCurves:
    """Generate complete performance curves.

    Evaluates the pump at n_points flow rates from q_min to q_max,
    expressed as ratios of the design flow rate.

    Args:
        sizing: SizingResult with design geometry.
        q_min_ratio: Minimum flow as fraction of Q_design (default 0.1).
        q_max_ratio: Maximum flow as fraction of Q_design (default 1.5).
        n_points: Number of evaluation points.
        rho: Fluid density [kg/m^3].

    Returns:
        PerformanceCurves with all curve data.
    """
    q_design = get_design_flow_rate(sizing)

    flow_rates: list[float] = []
    heads: list[float] = []
    efficiencies: list[float] = []
    powers: list[float] = []
    npsh_vals: list[float] = []
    eta_h_vals: list[float] = []
    torques: list[float] = []
    metrics: list[PerformanceMetrics] = []

    for i in range(n_points):
        ratio = q_min_ratio + (q_max_ratio - q_min_ratio) * i / (n_points - 1)
        q = q_design * ratio

        perf = evaluate_performance(sizing, q, rho)

        flow_rates.append(q)
        heads.append(perf.head)
        efficiencies.append(perf.total_efficiency)
        powers.append(perf.power)
        npsh_vals.append(perf.npsh_required)
        eta_h_vals.append(perf.hydraulic_efficiency)
        torques.append(perf.torque)
        metrics.append(perf)

    return PerformanceCurves(
        flow_rates=flow_rates,
        heads=heads,
        efficiencies=efficiencies,
        powers=powers,
        npsh_required=npsh_vals,
        hydraulic_efficiencies=eta_h_vals,
        torques=torques,
        metrics=metrics,
    )


def generate_hq_curve(
    sizing: SizingResult,
    q_min_ratio: float = 0.1,
    q_max_ratio: float = 1.5,
    n_points: int = 25,
) -> list[tuple[float, float]]:
    """Generate H-Q curve as a list of (Q, H) tuples.

    Args:
        sizing: SizingResult.
        q_min_ratio: Min flow ratio.
        q_max_ratio: Max flow ratio.
        n_points: Number of points.

    Returns:
        List of (Q [m^3/s], H [m]) tuples.
    """
    curves = generate_curves(sizing, q_min_ratio, q_max_ratio, n_points)
    return list(zip(curves.flow_rates, curves.heads))


def generate_efficiency_curve(
    sizing: SizingResult,
    q_min_ratio: float = 0.1,
    q_max_ratio: float = 1.5,
    n_points: int = 25,
) -> list[tuple[float, float]]:
    """Generate eta-Q curve as a list of (Q, eta) tuples."""
    curves = generate_curves(sizing, q_min_ratio, q_max_ratio, n_points)
    return list(zip(curves.flow_rates, curves.efficiencies))
