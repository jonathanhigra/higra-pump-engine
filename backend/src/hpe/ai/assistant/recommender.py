"""Design recommendation engine.

Analyzes sizing results and performance to suggest specific
improvements the engineer can make to the design.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from hpe.core.models import PerformanceMetrics, SizingResult
from hpe.physics.curves import PerformanceCurves


@dataclass
class Recommendation:
    """A single design improvement recommendation."""

    category: str  # "efficiency", "cavitation", "robustness", "manufacturing"
    priority: str  # "high", "medium", "low"
    parameter: str  # Which parameter to change
    direction: str  # "increase" or "decrease"
    reason: str  # Why this change helps
    expected_impact: str  # Qualitative impact description


def recommend_improvements(
    sizing: SizingResult,
    perf: PerformanceMetrics,
    curves: Optional[PerformanceCurves] = None,
) -> list[Recommendation]:
    """Generate design improvement recommendations.

    Analyzes the current design and suggests parameter changes
    to improve efficiency, reduce cavitation risk, or increase robustness.

    Args:
        sizing: Current SizingResult.
        perf: Performance at design point.
        curves: Optional performance curves for robustness analysis.

    Returns:
        List of Recommendations sorted by priority.
    """
    recs: list[Recommendation] = []

    # Efficiency recommendations
    _check_efficiency(sizing, perf, recs)

    # Cavitation recommendations
    _check_cavitation(sizing, perf, recs)

    # Robustness recommendations
    if curves:
        _check_robustness(sizing, curves, recs)

    # Blade geometry recommendations
    _check_blade_geometry(sizing, recs)

    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: priority_order.get(r.priority, 3))

    return recs


def _check_efficiency(
    sizing: SizingResult,
    perf: PerformanceMetrics,
    recs: list[Recommendation],
) -> None:
    eta = perf.total_efficiency

    if eta < 0.70:
        recs.append(Recommendation(
            category="efficiency",
            priority="high",
            parameter="beta2",
            direction="increase",
            reason="Low total efficiency indicates excessive hydraulic losses. Higher beta2 increases head coefficient and reduces passage deceleration.",
            expected_impact="2-5 percentage points improvement in hydraulic efficiency",
        ))

    if perf.hydraulic_efficiency < 0.80:
        recs.append(Recommendation(
            category="efficiency",
            priority="medium",
            parameter="blade_count",
            direction="increase",
            reason="Low hydraulic efficiency suggests poor flow guidance. More blades improve flow control but increase friction.",
            expected_impact="1-3pp improvement with diminishing returns above 9 blades",
        ))

    if perf.volumetric_efficiency < 0.90:
        recs.append(Recommendation(
            category="efficiency",
            priority="low",
            parameter="clearances",
            direction="decrease",
            reason="Low volumetric efficiency indicates significant leakage through wear ring clearances.",
            expected_impact="Tighter clearances improve eta_v but require better machining",
        ))


def _check_cavitation(
    sizing: SizingResult,
    perf: PerformanceMetrics,
    recs: list[Recommendation],
) -> None:
    npsh = perf.npsh_required

    if npsh > 8.0:
        recs.append(Recommendation(
            category="cavitation",
            priority="high",
            parameter="d1 (inlet diameter)",
            direction="increase",
            reason=f"High NPSHr ({npsh:.1f} m) limits installation flexibility. Larger inlet eye reduces eye velocity.",
            expected_impact="Each 10% increase in D1 reduces NPSHr by ~15-20%",
        ))

    if sizing.sigma > 0.3:
        recs.append(Recommendation(
            category="cavitation",
            priority="medium",
            parameter="rpm",
            direction="decrease",
            reason=f"High cavitation index (sigma={sizing.sigma:.3f}). Lower speed reduces velocity at inlet eye.",
            expected_impact="Halving RPM reduces NPSHr by ~4x (quadratic relationship)",
        ))


def _check_robustness(
    sizing: SizingResult,
    curves: PerformanceCurves,
    recs: list[Recommendation],
) -> None:
    # Check if efficiency drops sharply off-design
    if len(curves.efficiencies) < 5:
        return

    max_eta = max(curves.efficiencies)
    n = len(curves.efficiencies)

    # Check part-load
    partload_eta = curves.efficiencies[n // 4]  # ~25% point
    if partload_eta < max_eta * 0.70:
        recs.append(Recommendation(
            category="robustness",
            priority="medium",
            parameter="beta2",
            direction="decrease",
            reason="Efficiency drops sharply at part-load. Lower beta2 flattens the efficiency curve.",
            expected_impact="Better part-load efficiency at slight cost to peak efficiency",
        ))

    # Check overload
    overload_eta = curves.efficiencies[3 * n // 4]  # ~75% point
    if overload_eta < max_eta * 0.75:
        recs.append(Recommendation(
            category="robustness",
            priority="low",
            parameter="b2 (outlet width)",
            direction="increase",
            reason="Efficiency drops at overload. Wider outlet passage accommodates higher flow.",
            expected_impact="Better overload performance, slightly wider operating range",
        ))


def _check_blade_geometry(
    sizing: SizingResult,
    recs: list[Recommendation],
) -> None:
    # Tip speed check
    u2 = sizing.velocity_triangles["outlet"]["u"]
    if u2 > 45:
        recs.append(Recommendation(
            category="manufacturing",
            priority="low",
            parameter="d2 (outlet diameter)",
            direction="decrease",
            reason=f"Tip speed u2={u2:.1f} m/s is elevated. Consider noise and erosion implications.",
            expected_impact="Lower noise and vibration, longer wear ring life",
        ))

    # Deceleration ratio
    w1 = sizing.velocity_triangles["inlet"]["w"]
    w2 = sizing.velocity_triangles["outlet"]["w"]
    if w1 > 0 and w2 > 0:
        w_ratio = w1 / w2
        if w_ratio > 1.3:
            recs.append(Recommendation(
                category="efficiency",
                priority="medium",
                parameter="blade_count",
                direction="increase",
                reason=f"High deceleration ratio w1/w2={w_ratio:.2f} risks flow separation. More blades reduce passage divergence.",
                expected_impact="Reduced separation losses, 1-3pp efficiency gain",
            ))
