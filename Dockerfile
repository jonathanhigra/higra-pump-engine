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
