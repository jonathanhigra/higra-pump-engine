"""HPE Orchestrator — Celery task queue for async computation.

Manages background execution of expensive tasks: CFD, optimization,
batch parametric studies. Uses Celery + Redis for reliable queuing.

Usage:
    from hpe.orchestrator.tasks import run_sizing_task, run_optimization_task

    result = run_sizing_task.delay(flow_rate=0.05, head=30.0, rpm=1750)
    print(result.get(timeout=30))
"""

from hpe.orchestrator.celery_app import celery_app

__all__ = ["celery_app"]
