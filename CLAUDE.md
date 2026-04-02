# Higra Pump Engine (HPE)

Plataforma de engenharia para projeto, analise e otimizacao de turbomaquinas hidraulicas — bombas, turbinas e pump-turbines.

## Contexto do Projeto

- **Empresa**: HIGRA Industrial Ltda.
- **Autor**: Jonathan / Engenharia HIGRA
- **Benchmark**: ADT TURBOdesign Suite
- **Principio fundamental**: Sofisticacao interna com simplicidade externa

### Posicionamento Estrategico (3 Eixos)

1. **Acessibilidade** — Web-native (FastAPI + React), SaaS acessivel para PMEs (vs US$15k+/modulo da ADT)
2. **IA como Core** — IA embarcada em cada modulo (sugestao de parametros, surrogate models, assistente, aprendizado continuo)
3. **Validacao Industrial** — Dados reais de bancada HIGRA (tabela sigs.teste_bancada: 4.036 registros, 91 colunas)

### Foco Inicial

- Bombas centrifugas industriais
- Turbinas Francis
- Pump-turbines (armazenamento hidraulico por bombeamento)

## Arquitetura

### Fluxo Principal

```
Interface → Orquestrador → Dimensionamento → Geometria → Modelo IA (predicao rapida) →
Filtro de candidatos → CFD completo → Pos-processamento → Base de dados (retroalimenta IA)
```

### Modulos

| Modulo | Pacote | Descricao |
|--------|--------|-----------|
| Dimensionamento 1D | `hpe.sizing` | Meanline, triangulos de velocidade, Ns/Nq, NPSH |
| Geometria Parametrica | `hpe.geometry` | Runner, distribuidor, voluta, draft tube (CadQuery + OCCT) |
| Voluta | `hpe.geometry.volute` | Distribuicao de area, tongue radius, twin entry |
| Modelos Fisicos | `hpe.physics` | Euler, perdas, cavitacao, eficiencia (pre-CFD) |
| Simulacao CFD | `hpe.cfd` | OpenFOAM + SU2, geracao de malha, BCs |
| Pipeline CAE | `hpe.pipeline` | Geometria→Malha→Solver→Pos→Dashboard→IA |
| Pos-processamento | `hpe.postprocess` | Metricas, curvas H-Q, campos de pressao/velocidade |
| Otimizacao | `hpe.optimization` | NSGA-II/III, Bayesian, adjoint, surrogate-assisted |
| Orquestrador | `hpe.orchestrator` | Celery + Redis, filas, versionamento, execucao em lote |
| Interface | `hpe.api` + `frontend/` | FastAPI REST + React + Three.js |
| IA | `hpe.ai` | Surrogate models, assistente, aprendizado continuo |

### Stack Tecnologico

- **Linguagem**: Python 3.11+
- **Numerico**: NumPy, SciPy
- **CAD**: CadQuery + OpenCascade
- **CFD**: OpenFOAM, SU2
- **Malha**: snappyHexMesh, cfMesh
- **Pos**: ParaView (pvpython)
- **Backend**: FastAPI
- **Frontend**: React + TypeScript + Three.js
- **IA/ML**: PyTorch, Scikit-learn, Optuna, MLflow
- **DB**: PostgreSQL + MinIO (S3)
- **Orquestracao**: Celery + Redis
- **Containers**: Docker + Docker Compose
- **CI/CD**: GitHub Actions

## Convencoes de Codigo

- Python: PEP 8, type hints obrigatorios, docstrings em ingles
- Testes: pytest, localizados em `tests/` espelhando `src/`
- Imports: absolutos a partir de `hpe`
- Configuracao: Pydantic Settings, arquivos `.env`
- Logs: structlog com contexto de modulo

## Roadmap (Fase Atual: 1 — MVP)

Foco: Dimensionamento 1D + Geometria basica para bomba centrifuga.

| Fase | Escopo | Status |
|------|--------|--------|
| 1 — MVP | Dimensionamento 1D + Geometria basica | EM ANDAMENTO |
| 2 — CFD | Pipeline de simulacao automatizado | Planejado |
| 3 — Otimizacao | Loop de otimizacao + IA inicial | Planejado |
| 4 — Voluta | Modulo de voluta + distribuidor | Planejado |
| 5 — Plataforma | Interface web + Dashboard | Planejado |
| 6 — IA Avancada | Assistente + Aprendizado continuo | Planejado |

## Skills Necessarias por Modulo

### Sizing (hpe.sizing)
- Mecanica dos fluidos / hidraulica de turbomaquinas
- Correlacoes empiricas (Stepanoff, Gulich, Pfleiderer)
- Triangulos de velocidade, velocidade especifica (Ns, Nq)
- NPSH e cavitacao

### Geometry (hpe.geometry)
- Modelagem parametrica programatica (CadQuery)
- OpenCascade (OCCT) kernel geometrico
- Perfis de pas (NACA, arcos circulares, Bezier)
- Formatos CAD: STEP, IGES, STL

### Physics (hpe.physics)
- Equacao de Euler para turbomaquinas
- Modelos de perdas hidraulicas
- Analise de cavitacao (sigma, NPSH)
- Eficiencia hidraulica, volumetrica, mecanica

### CFD (hpe.cfd)
- OpenFOAM (simpleFoam, pimpleFoam, interFoam)
- SU2 (adjoint solver)
- Geracao de malha (snappyHexMesh, cfMesh)
- MRF e sliding mesh para turbomaquinas
- Boundary conditions para rotores

### Optimization (hpe.optimization)
- NSGA-II / NSGA-III (DEAP)
- Bayesian Optimization (Optuna)
- Surrogate-assisted optimization
- Otimizacao multiobjetivo (eficiencia vs cavitacao vs robustez)

### AI (hpe.ai)
- Surrogate models (PyTorch)
- Feature engineering para turbomaquinas
- MLflow para tracking de experimentos
- Aprendizado continuo com dados de bancada

### API (hpe.api)
- FastAPI com Pydantic models
- Autenticacao e multitenancy (futuro SaaS)
- WebSocket para progresso de simulacoes

### Frontend (frontend/)
- React + TypeScript
- Three.js / VTK.js para visualizacao 3D
- Dashboard tecnico com comparacao de projetos

## Principio de IA

IA como acelerador, nao como substituto da fisica. Validacao final sempre por CFD e, quando possivel, por ensaio em bancada de testes.
