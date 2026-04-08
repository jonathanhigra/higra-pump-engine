# ── Stage: base ───────────────────────────────────────────────────────────────
# Slim Python image with all non-CadQuery dependencies.  Used for the
# standard API, Celery workers, and any environment without GPU/GL.
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
    deap optuna scikit-learn xgboost torch

EXPOSE 8000

CMD ["uvicorn", "hpe.api.app:app", "--host", "0.0.0.0", "--port", "8000"]


# ── Stage: backend-cad ────────────────────────────────────────────────────────
# Extends the base image with CadQuery and its OpenCASCADE/GL dependencies.
# Use this stage when 3D STEP/STL export is required.
#
# Build:
#   docker build --target backend-cad -t hpe-backend-cad ./backend
#
# Note: This adds ~800 MB to the image.  Only deploy when 3D export is needed.
FROM base AS backend-cad

# OpenCASCADE / Mesa GL libs required by CadQuery / OCC
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglu1-mesa \
    libxi6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CadQuery 2.x — pulls in cadquery-occ (OCC wheels, ~600 MB)
RUN pip install --no-cache-dir "cadquery>=2.4"

# Verify CadQuery import works
RUN python -c "import cadquery; print('CadQuery', cadquery.__version__, 'OK')"
