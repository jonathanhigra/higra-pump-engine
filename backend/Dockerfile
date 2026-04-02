FROM python:3.11-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src/ src/

RUN pip install --no-cache-dir . 2>/dev/null || \
    pip install --no-cache-dir numpy scipy pydantic pydantic-settings \
    fastapi uvicorn sqlalchemy alembic celery redis minio structlog \
    deap optuna scikit-learn

EXPOSE 8000

CMD ["uvicorn", "hpe.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
