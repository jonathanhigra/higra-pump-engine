"""Application configuration via environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """HPE application settings loaded from environment or .env file."""

    # Application
    app_name: str = "Higra Pump Engine"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    database_url: str = "postgresql://hpe:hpe@localhost:5432/hpe"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"

    # MinIO / S3
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "hpe-data"

    # CFD
    openfoam_path: Path = Path("/opt/openfoam")
    su2_path: Path = Path("/usr/local/bin")
    max_cfd_cores: int = 8

    # AI / MLflow
    mlflow_tracking_uri: str = "http://localhost:5000"

    # Paths
    data_dir: Path = Path("data")
    output_dir: Path = Path("output")
    templates_dir: Path = Path("data/templates")

    model_config = {"env_prefix": "HPE_", "env_file": ".env"}


settings = Settings()
