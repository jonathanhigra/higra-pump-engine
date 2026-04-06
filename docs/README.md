# HPE -- Higra Pump Engine

## Visao Geral
Plataforma web de engenharia para projeto, analise e otimizacao de turbomaquinas hidraulicas.

## Quick Start

### Requisitos
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (opcional)

### Instalacao
```bash
# Backend
cd backend
pip install -e ".[optimization]"

# Frontend
cd frontend
npm install
```

### Executar
```bash
npm run start:all
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
```

### Docker
```bash
docker-compose up
```

## Modulos

### Dimensionamento 1D (hpe.sizing)
- Meanline sizing com correlacoes Gulich/Stepanoff
- Velocidade especifica Nq, triangulos de velocidade
- NPSH e cavitacao
- Multi-stage, axial compressor, Francis turbine

### Geometria (hpe.geometry)
- Geracao 3D de pas (PS/SS) com espessura NACA
- Canal meridional parametrico
- Splitter blades, stacking, LE/TE refinement
- Export: STEP, STL, IGES, glTF, BladeGen (.bgd), GEO

### Analise (hpe.physics)
- Perdas hidraulicas detalhadas
- Analise de tensoes (von Mises, fadiga)
- Predicao de ruido
- Curvas H-Q e mapas de eficiencia

### Otimizacao (hpe.optimization)
- NSGA-II multi-objetivo (DEAP)
- Bayesian (Optuna)
- Response Surface (RSM, RRS)
- Design of Experiments (LHS)

### CFD (hpe.cfd)
- OpenFOAM case generation
- ANSYS CFX/Fluent integration
- TurboGrid automation
- Design loop iterativo

### IA (hpe.ai)
- Surrogate models (Random Forest)
- Anomaly detection
- Auto-training pipeline

## API Reference
Swagger UI: http://localhost:8000/docs

## Stack
- Backend: Python 3.11+ / FastAPI / NumPy / SciPy
- Frontend: React / TypeScript / Three.js
- Database: PostgreSQL
- CFD: OpenFOAM / ANSYS CFX
