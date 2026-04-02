"""HPE Physics — Pre-CFD fast physical models for geometry screening.

Fast models for evaluating pump performance at any operating point
without running CFD. Each evaluation takes milliseconds vs hours for CFD.

Usage:
    from hpe.sizing import run_sizing
    from hpe.core.models import OperatingPoint
    from hpe.physics import evaluate_performance, generate_curves, analyze_stability

    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    sizing = run_sizing(op)

    # Single point
    perf = evaluate_performance(sizing, q_actual=0.04)

    # Full curves
    curves = generate_curves(sizing)

    # Stability analysis
    stability = analyze_stability(sizing)
"""

from hpe.physics.curves import generate_curves, generate_hq_curve, generate_efficiency_curve
from hpe.physics.performance import evaluate_performance, evaluate_design_point
from hpe.physics.stability import analyze_stability, find_bep

__all__ = [
    "evaluate_performance",
    "evaluate_design_point",
    "generate_curves",
    "generate_hq_curve",
    "generate_efficiency_curve",
    "analyze_stability",
    "find_bep",
]
