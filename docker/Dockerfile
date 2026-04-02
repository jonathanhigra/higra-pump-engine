FROM python:3.11-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir ".[all]" || pip install --no-cache-dir .

COPY src/ src/
COPY configs/ configs/

EXPOSE 8000

CMD ["uvicorn", "hpe.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
