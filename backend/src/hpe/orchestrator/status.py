"""Redis-based status tracking for HPE pipeline runs.

Provides a ``StatusTracker`` that stores ``PipelineStatus`` objects in Redis
(TTL = 1 h) and falls back to an in-memory dict when Redis is unavailable.
A module-level ``tracker`` singleton is exported for use across the codebase.

WebSocket endpoint reads from this store every 500 ms and streams updates
to the browser.

Usage
-----
    from hpe.orchestrator.status import tracker, PipelineStatus

    tracker.set(run_id, PipelineStatus(
        run_id=run_id, status="running", stage="sizing",
        progress=10, elapsed_s=0.0, eta_s=None, message="Starting",
    ))

    status = tracker.get(run_id)
    tracker.update_progress(run_id, 50, "geometry", "Building CAD")
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from typing import Optional

log = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", os.getenv("HPE_CELERY_BROKER_URL", "redis://localhost:6379/0"))
STATUS_TTL = 3600  # seconds — keep results available for 1 hour


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class PipelineStatus:
    """Snapshot of a pipeline run at a given point in time."""

    run_id: str
    status: str          # "pending" | "running" | "completed" | "failed"
    stage: str           # "sizing" | "geometry" | "surrogate" | "cfd" | "done"
    progress: int        # 0–100
    elapsed_s: float
    eta_s: Optional[float]
    message: str
    result: Optional[dict] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "PipelineStatus":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})

    @classmethod
    def pending(cls, run_id: str) -> "PipelineStatus":
        return cls(
            run_id=run_id, status="pending", stage="pending",
            progress=0, elapsed_s=0.0, eta_s=None, message="Queued",
        )


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------

class StatusTracker:
    """Thread-safe status store backed by Redis with in-memory fallback.

    The Redis connection is established lazily on first use and reconnected
    on errors.  All operations are wrapped in try/except so a Redis outage
    never crashes the main pipeline.
    """

    def __init__(self) -> None:
        self._redis = None
        self._memory: dict[str, dict] = {}
        self._start_times: dict[str, float] = {}
        self._connected = False
        self._try_connect()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _try_connect(self) -> None:
        """Attempt to connect to Redis; silently fall back to in-memory."""
        try:
            import redis  # deferred import

            client = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
            client.ping()
            self._redis = client
            self._connected = True
            log.debug("StatusTracker: connected to Redis at %s", REDIS_URL)
        except Exception as exc:
            self._redis = None
            self._connected = False
            log.debug("StatusTracker: Redis unavailable (%s) — using in-memory fallback", exc)

    def _redis_key(self, run_id: str) -> str:
        return f"hpe:pipeline:status:{run_id}"

    def _store(self, run_id: str, data: dict) -> None:
        """Persist status to Redis or in-memory dict."""
        if self._redis is not None:
            try:
                self._redis.setex(self._redis_key(run_id), STATUS_TTL, json.dumps(data))
                return
            except Exception as exc:
                log.warning("StatusTracker._store: Redis write failed (%s) — switching to memory", exc)
                self._redis = None
                self._connected = False
        # In-memory fallback
        self._memory[run_id] = data

    def _load(self, run_id: str) -> Optional[dict]:
        """Load status from Redis or in-memory dict."""
        if self._redis is not None:
            try:
                raw = self._redis.get(self._redis_key(run_id))
                if raw:
                    return json.loads(raw)
                return None
            except Exception as exc:
                log.warning("StatusTracker._load: Redis read failed (%s) — trying memory", exc)
                self._redis = None
                self._connected = False
        return self._memory.get(run_id)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def backend(self) -> str:
        """Return ``"redis"`` if connected, else ``"memory"``."""
        return "redis" if self._connected else "memory"

    def set(self, run_id: str, status: PipelineStatus) -> None:
        """Persist a complete PipelineStatus snapshot."""
        if run_id not in self._start_times:
            self._start_times[run_id] = time.monotonic()
        self._store(run_id, status.to_dict())

    def get(self, run_id: str) -> Optional[PipelineStatus]:
        """Retrieve the latest PipelineStatus for a run, or ``None``."""
        data = self._load(run_id)
        if data is None:
            return None
        try:
            return PipelineStatus.from_dict(data)
        except Exception as exc:
            log.warning("StatusTracker.get: cannot deserialise status for %s — %s", run_id, exc)
            return None

    def update_progress(
        self,
        run_id: str,
        progress: int,
        stage: str,
        message: str = "",
    ) -> None:
        """Convenience helper: update progress + stage + message atomically.

        If no status exists yet for this run_id, a new one is created with
        status ``"running"``.
        """
        if run_id not in self._start_times:
            self._start_times[run_id] = time.monotonic()

        elapsed = round(time.monotonic() - self._start_times[run_id], 2)

        # Estimate ETA from current progress
        eta_s: Optional[float] = None
        if progress > 0:
            eta_s = round(elapsed / progress * (100 - progress), 1)

        current = self.get(run_id)
        if current is None:
            status_str = "running"
            result = None
            error = None
        else:
            status_str = current.status if current.status not in ("completed", "failed") else current.status
            result = current.result
            error = current.error

        if stage == "done":
            status_str = "completed"
            progress = 100
        elif stage == "failed":
            status_str = "failed"

        new_status = PipelineStatus(
            run_id=run_id,
            status=status_str,
            stage=stage,
            progress=min(progress, 100),
            elapsed_s=elapsed,
            eta_s=eta_s if status_str == "running" else None,
            message=message,
            result=result,
            error=error,
        )
        self._store(run_id, new_status.to_dict())

    def complete(self, run_id: str, result: dict) -> None:
        """Mark a run as completed and store the final result."""
        elapsed = round(time.monotonic() - self._start_times.get(run_id, time.monotonic()), 2)
        status = PipelineStatus(
            run_id=run_id, status="completed", stage="done",
            progress=100, elapsed_s=elapsed, eta_s=None,
            message="Pipeline completed", result=result,
        )
        self._store(run_id, status.to_dict())

    def fail(self, run_id: str, error: str) -> None:
        """Mark a run as failed and record the error message."""
        elapsed = round(time.monotonic() - self._start_times.get(run_id, time.monotonic()), 2)
        status = PipelineStatus(
            run_id=run_id, status="failed", stage="failed",
            progress=0, elapsed_s=elapsed, eta_s=None,
            message="Pipeline failed", error=error,
        )
        self._store(run_id, status.to_dict())

    def delete(self, run_id: str) -> None:
        """Remove status for a run (cleanup)."""
        if self._redis is not None:
            try:
                self._redis.delete(self._redis_key(run_id))
            except Exception:
                pass
        self._memory.pop(run_id, None)
        self._start_times.pop(run_id, None)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

tracker = StatusTracker()
