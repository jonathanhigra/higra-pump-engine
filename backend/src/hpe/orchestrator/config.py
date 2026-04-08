"""Celery app configuration for HPE Pipeline Orchestrator.

Provides make_celery() factory and a module-level celery_app singleton.
Gracefully degrades when Celery is not installed (ImportError is deferred
until a task is actually submitted).
"""

from __future__ import annotations

import os

REDIS_URL = os.getenv("REDIS_URL", os.getenv("HPE_CELERY_BROKER_URL", "redis://localhost:6379/0"))


def make_celery():
    """Create and configure Celery app for HPE.

    Returns a fully configured Celery instance, or raises ImportError if
    the ``celery`` package is not installed.
    """
    from celery import Celery  # deferred — not a hard dependency at import time

    app = Celery("hpe", broker=REDIS_URL, backend=REDIS_URL)
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_routes={
            "hpe.orchestrator.tasks.*sizing*": {"queue": "fast"},
            "hpe.orchestrator.tasks.*geometry*": {"queue": "fast"},
            "hpe.orchestrator.tasks.*surrogate*": {"queue": "fast"},
            "hpe.orchestrator.tasks.*cfd*": {"queue": "cfd"},
            "hpe.orchestrator.tasks.*optim*": {"queue": "optimize"},
            # existing task names kept for backwards-compat
            "hpe.sizing": {"queue": "fast"},
            "hpe.curves": {"queue": "fast"},
            "hpe.pipeline": {"queue": "fast"},
            "hpe.optimize": {"queue": "optimize"},
        },
        task_soft_time_limit=3600,
        task_time_limit=4000,
        worker_prefetch_multiplier=1,
        worker_max_tasks_per_child=50,
    )
    return app


# ---------------------------------------------------------------------------
# Module-level singleton
# Try to instantiate immediately; fall back to a lazy stub if Celery is absent.
# ---------------------------------------------------------------------------

try:
    celery_app = make_celery()
except ImportError:  # pragma: no cover
    celery_app = None  # type: ignore[assignment]
