.PHONY: dev prod test seed train-surrogate train-pinn lint

# Desenvolvimento
dev:
	PYTHONPATH=backend/src uvicorn hpe.api.app:app --host 0.0.0.0 --port 8000 --reload

# Produção (Docker Compose)
prod:
	docker compose up --build -d

prod-logs:
	docker compose logs -f backend celery-fast

# Testes
test:
	PYTHONPATH=backend/src pytest tests/ -v --tb=short

test-api:
	PYTHONPATH=backend/src pytest tests/test_api_integration.py -v

test-validation:
	PYTHONPATH=backend/src pytest tests/regression/ -v

# Dados
seed:
	PYTHONPATH=backend/src python backend/src/hpe/data/bancada_seed.py

etl:
	PYTHONPATH=backend/src python -m hpe.data.bancada_etl

# ML
train-surrogate:
	PYTHONPATH=backend/src python -c "from hpe.ai.surrogate.v1_xgboost import SurrogateV1; v=SurrogateV1(); v.train('dataset/bancada_features.parquet')"

train-pinn:
	PYTHONPATH=backend/src python -c "from hpe.ai.pinn.trainer import train_pinn_from_bancada; train_pinn_from_bancada(epochs=200)"

# Frontend
frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

# Linting
lint:
	PYTHONPATH=backend/src python -m ruff check backend/src/hpe/ --select E,W,F
