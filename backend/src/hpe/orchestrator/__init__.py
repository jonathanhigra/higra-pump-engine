"""HPE Pipeline Orchestrator — Celery tasks + design versioning.

Manages background execution of expensive tasks: sizing, geometry,
surrogate prediction, CFD, optimisation and full pipeline runs.
Uses Celery + Redis for reliable queuing with in-memory fallback.

Usage
-----
    from hpe.orchestrator.tasks import run_sizing_task, run_full_pipeline_task

    # Async (requires running Celery worker + Redis)
    result = run_sizing_task.delay({"Q": 200, "H": 45, "n": 1750})
    print(result.get(timeout=30))

    # Status tracking
    from hpe.orchestrator.status import tracker
    status = tracker.get(run_id)

    # Design versioning
    from hpe.orchestrator.versions import DesignVersion, save_version
"""

# Re-export the Celery app from the canonical config module.
# Also keep backward-compat import from the legacy celery_app module.
try:
    from hpe.orchestrator.config import celery_app  # noqa: F401
except Exception:  # pragma: no cover
    try:
        from hpe.orchestrator.celery_app import celery_app  # noqa: F401
    except Exception:
        celery_app = None  # type: ignore[assignment]

__all__ = ["celery_app"]
