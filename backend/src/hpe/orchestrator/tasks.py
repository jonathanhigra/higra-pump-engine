"""Celery tasks for background computation.

Each task wraps an HPE module function and returns a serializable result.
Tasks can be chained for pipeline execution: sizing → geometry → CFD.
"""

from __future__ import annotations

from hpe.orchestrator.celery_app import celery_app


@celery_app.task(bind=True, name="hpe.sizing")
def run_sizing_task(self, flow_rate: float, head: float, rpm: float) -> dict:
    """Run 1D sizing in background."""
    import sys
    import os
    # Ensure src is in path for worker processes
    src_dir = os.path.join(os.path.dirname(__file__), '..', '..')
    if src_dir not in sys.path:
        sys.path.insert(0, os.path.abspath(src_dir))

    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    self.update_state(state="RUNNING", meta={"step": "sizing"})

    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    result = run_sizing(op)

    return {
        "specific_speed_nq": result.specific_speed_nq,
        "impeller_d2": result.impeller_d2,
        "impeller_d1": result.impeller_d1,
        "impeller_b2": result.impeller_b2,
        "blade_count": result.blade_count,
        "beta1": result.beta1,
        "beta2": result.beta2,
        "estimated_efficiency": result.estimated_efficiency,
        "estimated_power": result.estimated_power,
        "warnings": result.warnings,
    }


@celery_app.task(bind=True, name="hpe.curves")
def run_curves_task(self, flow_rate: float, head: float, rpm: float, n_points: int = 25) -> dict:
    """Generate performance curves in background."""
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing
    from hpe.physics.curves import generate_curves

    self.update_state(state="RUNNING", meta={"step": "curves"})

    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    sizing = run_sizing(op)
    curves = generate_curves(sizing, n_points=n_points)

    return {
        "flow_rates": curves.flow_rates,
        "heads": curves.heads,
        "efficiencies": curves.efficiencies,
        "powers": curves.powers,
    }


@celery_app.task(bind=True, name="hpe.optimize", time_limit=7200)
def run_optimization_task(
    self, flow_rate: float, head: float, rpm: float,
    method: str = "nsga2", pop_size: int = 40, n_gen: int = 50,
) -> dict:
    """Run multi-objective optimization (long-running)."""
    self.update_state(state="RUNNING", meta={"step": "optimization", "method": method})

    from hpe.optimization import run_optimization
    from hpe.optimization.problem import OptimizationProblem

    problem = OptimizationProblem.default(flow_rate, head, rpm)
    result = run_optimization(problem, method=method, pop_size=pop_size, n_gen=n_gen)

    return {
        "pareto_front": result.pareto_front,
        "n_evaluations": result.all_evaluations,
    }


@celery_app.task(bind=True, name="hpe.pipeline")
def run_full_pipeline_task(
    self, flow_rate: float, head: float, rpm: float,
) -> dict:
    """Run the full design pipeline: sizing → losses → stress → curves."""
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing
    from hpe.physics.curves import generate_curves
    from hpe.physics.euler import calc_off_design_triangles, get_design_flow_rate
    from hpe.physics.advanced_losses import calc_advanced_losses
    from hpe.physics.stress import analyze_stress

    # Step 1: Sizing
    self.update_state(state="RUNNING", meta={"step": "sizing", "progress": 20})
    op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
    sizing = run_sizing(op)

    # Step 2: Losses
    self.update_state(state="RUNNING", meta={"step": "losses", "progress": 40})
    q_design = get_design_flow_rate(sizing)
    tri_in, tri_out = calc_off_design_triangles(sizing, flow_rate)
    losses = calc_advanced_losses(sizing, flow_rate, q_design, tri_in, tri_out)

    # Step 3: Stress
    self.update_state(state="RUNNING", meta={"step": "stress", "progress": 60})
    stress_result = analyze_stress(sizing, rpm=rpm, head=head, flow_rate=flow_rate)

    # Step 4: Curves
    self.update_state(state="RUNNING", meta={"step": "curves", "progress": 80})
    curves = generate_curves(sizing, n_points=25)

    self.update_state(state="RUNNING", meta={"step": "complete", "progress": 100})

    return {
        "sizing": {
            "nq": sizing.specific_speed_nq,
            "d2": sizing.impeller_d2,
            "efficiency": sizing.estimated_efficiency,
        },
        "losses": {
            "total": losses.total_head_loss,
            "coefficient": losses.loss_coefficient,
        },
        "stress": {
            "von_mises": stress_result.von_mises_max,
            "is_safe": stress_result.is_safe,
        },
        "n_curve_points": len(curves.flow_rates),
    }
