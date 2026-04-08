"""MinIO object storage integration for geometry files.

Uploads STEP/STL exports to MinIO and returns presigned download URLs.
Falls back gracefully when ``minio`` is not installed or the server is
unreachable.

Configuration is read from environment variables (or passed explicitly):

    MINIO_ENDPOINT   default: localhost:9000
    MINIO_ACCESS_KEY default: minioadmin
    MINIO_SECRET_KEY default: minioadmin
    MINIO_BUCKET     default: hpe-geometry
    MINIO_SECURE     default: false   (set to "true" for HTTPS)

Usage
-----
    from hpe.geometry.storage import upload_geometry_files, GeometryUploadResult

    result = upload_geometry_files(step_path=Path("runner.step"), run_id="abc123")
    if result.available:
        print(result.step_url)
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

try:
    from minio import Minio
    from minio.error import S3Error
    _MINIO_AVAILABLE = True
except ImportError:
    Minio = None  # type: ignore[assignment,misc]
    S3Error = Exception  # type: ignore[assignment,misc]
    _MINIO_AVAILABLE = False


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _get_client() -> "Minio":
    """Build a Minio client from environment variables."""
    endpoint = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
    access_key = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
    secure = os.environ.get("MINIO_SECURE", "false").lower() == "true"
    return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)


def _ensure_bucket(client: "Minio", bucket: str) -> None:
    """Create bucket if it doesn't exist."""
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        log.info("storage: created MinIO bucket '%s'", bucket)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class GeometryUploadResult:
    """Result of a geometry file upload to MinIO.

    Attributes
    ----------
    available : bool
        True if MinIO is installed and the upload succeeded.
    step_url : Optional[str]
        Presigned URL for the STEP file (valid 24 h), or None.
    stl_url : Optional[str]
        Presigned URL for the STL file (valid 24 h), or None.
    reason : str
        Human-readable explanation when available=False.
    """
    available: bool
    step_url: Optional[str] = None
    stl_url: Optional[str] = None
    reason: str = ""


def upload_geometry_files(
    run_id: str,
    step_path: Optional[Path] = None,
    stl_path: Optional[Path] = None,
    bucket: Optional[str] = None,
    url_expiry_hours: int = 24,
) -> GeometryUploadResult:
    """Upload STEP/STL files to MinIO and return presigned URLs.

    Args:
        run_id: Unique identifier for this geometry run (used as object prefix).
        step_path: Local path to the STEP file, or None to skip.
        stl_path: Local path to the STL file, or None to skip.
        bucket: MinIO bucket name.  Defaults to the ``MINIO_BUCKET`` env var
            or ``"hpe-geometry"``.
        url_expiry_hours: Presigned URL validity in hours.

    Returns:
        :class:`GeometryUploadResult` with presigned URLs.
    """
    if not _MINIO_AVAILABLE:
        reason = (
            "minio package not installed.  Add it with: pip install minio  "
            "(or use the full Docker stack which includes MinIO)"
        )
        log.warning("upload_geometry_files: %s", reason)
        return GeometryUploadResult(available=False, reason=reason)

    bucket = bucket or os.environ.get("MINIO_BUCKET", "hpe-geometry")
    expiry = timedelta(hours=url_expiry_hours)

    try:
        client = _get_client()
        _ensure_bucket(client, bucket)
    except Exception as exc:
        reason = f"MinIO connection failed: {exc}"
        log.error("upload_geometry_files: %s", reason)
        return GeometryUploadResult(available=False, reason=reason)

    step_url: Optional[str] = None
    stl_url: Optional[str] = None

    if step_path and Path(step_path).is_file():
        object_name = f"{run_id}/runner.step"
        try:
            client.fput_object(bucket, object_name, str(step_path))
            step_url = client.presigned_get_object(bucket, object_name, expires=expiry)
            log.info("upload_geometry_files: STEP uploaded → %s", object_name)
        except S3Error as exc:
            log.error("upload_geometry_files: STEP upload failed: %s", exc)

    if stl_path and Path(stl_path).is_file():
        object_name = f"{run_id}/runner.stl"
        try:
            client.fput_object(bucket, object_name, str(stl_path))
            stl_url = client.presigned_get_object(bucket, object_name, expires=expiry)
            log.info("upload_geometry_files: STL uploaded → %s", object_name)
        except S3Error as exc:
            log.error("upload_geometry_files: STL upload failed: %s", exc)

    return GeometryUploadResult(
        available=True,
        step_url=step_url,
        stl_url=stl_url,
    )
