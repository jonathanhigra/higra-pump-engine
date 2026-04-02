# Higra Pump Engine (HPE)

Platform for design, analysis, and optimization of hydraulic turbomachinery -- pumps, turbines, and pump-turbines.

Developed by HIGRA Industrial Ltda.

## Quick Start

```bash
# Install
pip install -e ".[dev]"

# Run sizing for a centrifugal pump
python -m hpe.cli sizing --flow 0.05 --head 30 --rpm 1750

# Generate performance curves
python -m hpe.cli curves --flow 0.05 --head 30 --rpm 1750

# Run stability analysis
python -m hpe.cli analyze --flow 0.05 --head 30 --rpm 1750

# Run multi-objective optimization
python -m hpe.cli optimize --flow 0.05 --head 30 --rpm 1750

# Generate OpenFOAM CFD case
python -m hpe.cli cfd --flow 0.05 --head 30 --rpm 1750 -o ./case_pump

# Export geometry to STEP
python -m hpe.cli sizing --flow 0.05 --head 30 --rpm 1750 --export pump.step

# Run API server
uvicorn hpe.api.app:app --reload
```

## Architecture

```
OperatingPoint (Q, H, RPM)
    |
    v
[hpe.sizing]          1D meanline dimensioning (Ns, velocity triangles, efficiency)
    |
    v
[hpe.geometry]        Parametric 3D: runner + volute + distributor (CadQuery/OCCT)
    |
    v
[hpe.physics]         Off-design performance, H-Q curves, stability (BEP, surge)
    |
    v
[hpe.cfd]             OpenFOAM case generation (mesh, BCs, MRF, k-omega SST)
    |
    v
[hpe.optimization]    NSGA-II multi-objective + Bayesian optimization
    |
    v
[hpe.ai]              Surrogate models, assistant, anomaly detection, training
```

## Modules

| Module | Description |
|--------|-------------|
| `hpe.sizing` | 1D meanline: Ns/Nq, velocity triangles, impeller sizing, NPSH, Francis turbines |
| `hpe.geometry` | Parametric 3D: runner (CadQuery), volute, distributor. Export STEP/STL |
| `hpe.physics` | Off-design Euler head, loss models, H-Q/eta-Q curves, BEP/stability |
| `hpe.cfd` | OpenFOAM: blockMesh, snappyHexMesh, BCs, MRF, simpleFoam runner |
| `hpe.pipeline` | Orchestrator: geometry -> mesh -> solver -> post-processing |
| `hpe.postprocess` | OpenFOAM log/forces parser, performance metrics extraction |
| `hpe.optimization` | NSGA-II (DEAP), Bayesian (Optuna), multi-objective Pareto |
| `hpe.ai.surrogate` | RandomForest surrogate, LHS dataset, fast prediction |
| `hpe.ai.assistant` | Result interpretation, design recommendations |
| `hpe.ai.anomaly` | Isolation Forest anomaly detection, physics validators |
| `hpe.ai.training` | Retrain pipeline, incremental learning, experiment tracking |
| `hpe.api` | FastAPI REST: /sizing, /curves, /optimize endpoints |
| `hpe.core` | Models, enums, config, database schemas, persistence |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sizing` | Run 1D meanline sizing |
| POST | `/api/v1/curves` | Generate H-Q, eta-Q performance curves |
| POST | `/api/v1/optimize` | Run multi-objective optimization |
| GET | `/health` | Health check |

## Tech Stack

- **Python 3.9+**, NumPy, SciPy
- **CadQuery + OpenCascade** (parametric CAD)
- **OpenFOAM** (CFD)
- **DEAP** (NSGA-II), **Optuna** (Bayesian optimization)
- **scikit-learn** (surrogate models)
- **FastAPI** (REST API)
- **React + TypeScript** (frontend)
- **PostgreSQL + SQLAlchemy** (database)
- **Docker Compose** (deployment)

## Development

```bash
# Install with all extras
pip install -e ".[all]"

# Run tests
pytest tests/ -v

# Run specific module tests
pytest tests/sizing/ -v
pytest tests/geometry/ -v
pytest tests/physics/ -v

# Docker services (PostgreSQL, Redis, MinIO, MLflow)
docker-compose up -d
```

## License

Proprietary -- HIGRA Industrial Ltda.
