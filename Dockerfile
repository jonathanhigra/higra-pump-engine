# ── Stage: backend ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS backend

WORKDIR /app/backend

# Install system deps needed by psycopg2-binary and other packages
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only dependency files first (layer cache)
COPY backend/pyproject.toml backend/README.md ./

# Install core + optimization extras.
# Core now includes: scikit-learn, xgboost, joblib, pyarrow (surrogate + parquet).
# optimization adds: deap, optuna.
# torch and cadquery are excluded to keep the image lean (~600 MB vs 3+ GB).
RUN pip install --no-cache-dir -e ".[optimization]"

# MLflow for experiment tracking (optional but useful in production)
RUN pip install --no-cache-dir "mlflow>=2.11"

# Copy source (after deps so rebuilds are fast)
COPY backend/src ./src

ENV PYTHONPATH=/app/backend/src

EXPOSE 8000
CMD ["uvicorn", "hpe.api.app:app", "--host", "0.0.0.0", "--port", "8000"]


# ── Stage: backend-cad ────────────────────────────────────────────────────────
# Extends the backend image with CadQuery for real STEP/STL 3D geometry export.
#
# Use this stage in docker-compose.yml by changing `target: backend` to
# `target: backend-cad` for the services that need 3D export.
#
# Build:
#   docker build --target backend-cad -t hpe-backend-cad .
#
# Note: adds ~800 MB (OpenCASCADE wheels).  Only use where 3D export is needed.
FROM backend AS backend-cad

# OpenCASCADE / Mesa GL libs required by CadQuery
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1-mesa-glx \
      libglu1-mesa \
      libxi6 \
      libxrender1 \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CadQuery 2.x — installs cadquery-occ (OCC wheels, ~600 MB)
RUN pip install --no-cache-dir "cadquery>=2.4"

# MinIO client for geometry file upload
RUN pip install --no-cache-dir "minio>=7.0"

# Smoke test — fail fast if the OCC import is broken
RUN python -c "import cadquery; print('CadQuery', cadquery.__version__, 'OK')"


# ── Stage: frontend-build ─────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline

COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig.json ./
COPY frontend/tsconfig.node.json* ./
COPY frontend/src ./src
COPY frontend/public ./public 2>/dev/null || true

RUN npm run build


# ── Stage: production (single-container deploy) ───────────────────────────────
# Runs the FastAPI backend AND serves the built frontend as StaticFiles.
FROM python:3.12-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages and executables from the backend stage
COPY --from=backend /usr/local/lib/python3.12/site-packages \
                    /usr/local/lib/python3.12/site-packages
COPY --from=backend /usr/local/bin /usr/local/bin

# Copy backend source
COPY --from=backend /app/backend /app/backend

# Copy compiled frontend assets
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV PYTHONPATH=/app/backend/src
ENV HPE_FRONTEND_DIR=/app/frontend/dist

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "hpe.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
