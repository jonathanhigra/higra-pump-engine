"""Celery application configuration."""

from __future__ import annotations

import os

from celery import Celery

broker_url = os.getenv("HPE_CELERY_BROKER_URL", "redis://localhost:6379/1")
result_backend = os.getenv("HPE_CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

celery_app = Celery(
    "hpe",
    broker=broker_url,
    backend=result_backend,
    include=["hpe.orchestrator.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    task_soft_time_limit=3300,  # Soft limit at 55 min
    worker_prefetch_multiplier=1,  # Fair scheduling
    worker_max_tasks_per_child=50,  # Prevent memory leaks
)
