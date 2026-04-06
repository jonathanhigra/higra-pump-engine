# --- Backend ---
FROM python:3.12-slim AS backend
WORKDIR /app/backend
COPY backend/pyproject.toml backend/README.md ./
COPY backend/src ./src
RUN pip install --no-cache-dir -e ".[optimization]"
EXPOSE 8000
CMD ["uvicorn", "hpe.api.app:app", "--host", "0.0.0.0", "--port", "8000"]

# --- Frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# --- Production ---
FROM python:3.12-slim
WORKDIR /app

# Backend
COPY --from=backend /app/backend /app/backend
COPY --from=backend /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages

# Frontend static files
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Serve frontend via uvicorn + StaticFiles
ENV PYTHONPATH=/app/backend/src
EXPOSE 8000
CMD ["uvicorn", "hpe.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
