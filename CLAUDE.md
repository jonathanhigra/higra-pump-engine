# HPE — Context (Estado Atual)

> Atualizar este arquivo ao final de cada sessao de desenvolvimento.
> Este e o primeiro documento que o Claude Code deve ler antes de qualquer tarefa.

---

## Estado Geral

- **Data**: Abril 2026
- **Fases implementadas**: 1, 2, 3, 4, 5 e 6 — pipeline completo commitado
- **Progresso geral**: ~92% — backend + testes E2E completos; falta frontend integrado e deploy
- **Proximo marco**: Integrar PipelinePanel/AssistantChat no App.tsx + docker-compose production

---

## Arquitetura Implementada (6 Fases)

```
hpe/
├── sizing/          # Fase 1 — Meanline 1D (Gülich), CLI, API
├── geometry/        # Fase 1/4 — Runner paramétrico, voluta, CadQuery opcional
├── data/            # Fase 1 — ETL bancada, FeatureStore, training_log, seed
├── ai/
│   ├── surrogate/   # Fase 1 (XGBoost v1) + Fase 3 (GP v2) + evaluator
│   ├── pinn/        # Fase 6 — Physics-Informed NN (PyTorch + numpy fallback)
│   └── assistant/   # Fase 6 — RAG engineering assistant + offline rules
├── cfd/             # Fase 2 — OpenFOAM case builder, SU2, mesh, extractor
├── optimization/    # Fase 3 — NSGA-II (DEAP), Bayesian (Optuna), surrogate-assisted
├── orchestrator/    # Fase 5 — Celery tasks, Redis status, design versioning
└── api/             # FastAPI v2.0 — sizing, geometry, surrogate, voluta, WebSocket
```

---

## O Que Ja Existe (implementado)

### Fase 1 — MVP
- [x] ETL bancada (`hpe/data/bancada_etl.py`) — 2.931 linhas, 35 features, Parquet
- [x] training_log schema (PostgreSQL `hpe.training_log`) — 26 colunas
- [x] Surrogate v1 XGBoost (`hpe/ai/surrogate/v1_xgboost.py`) — RMSE 2.8-3.0%, R2 0.986
- [x] SurrogateEvaluator (`hpe/ai/surrogate/evaluator.py`) — interface versao-agnostica
- [x] FeatureStore (`hpe/data/feature_store.py`)
- [x] API FastAPI v2.0 — POST /sizing/run, /geometry/run, /surrogate/predict, /surrogate/similar, GET /health
- [x] CLI `hpe sizing/curves/analyze/cfd/optimize/batch`
- [x] 12 skill files em `.claude/skills/`
- [x] M1.8 Validacao Integrada — 435 pontos, MAPE 11.69% < 15% (APROVADO)
- [x] 49 testes de integracao da API (100% passing)

### Fase 2 — CFD Pipeline
- [x] `hpe/cfd/pipeline.py` — run_cfd_pipeline() — sizing→caso OpenFOAM→solver→training_log
- [x] `hpe/cfd/openfoam/` — case.py, boundary_conditions.py, solver_config.py
- [x] `hpe/cfd/mesh/snappy.py` — snappyHexMesh + blockMesh + quality check
- [x] `hpe/cfd/results/extract.py` — parse postProcessing/ → H, Q, eta, P
- [x] `hpe/cfd/su2/config.py` — config.cfg RANS + adjoint

### Fase 3 — Surrogate v2 + Otimizacao
- [x] `hpe/ai/surrogate/v2_gp.py` — GP com incerteza (sklearn), subsample 500pts
- [x] `hpe/optimization/problem.py` — DesignPoint, ObjectiveValues, OptimizationProblem
- [x] `hpe/optimization/nsga2.py` — NSGA-II (DEAP ou implementacao propria)
- [x] `hpe/optimization/bayesian.py` — Bayesian (Optuna ou random search fallback)
- [x] `hpe/optimization/surrogate_opt.py` — 2 estagios: surrogate fast + sizing validate

### Fase 4 — Voluta + Feedback Loop
- [x] `hpe/data/bancada_seed.py` — seed training_log com 460 registros bancada
- [x] `hpe/geometry/volute/pipeline.py` — run_volute_pipeline(SizingResult)
- [x] `hpe/api/volute_endpoint.py` — POST /volute/run

### Fase 5 — Orquestrador
- [x] `hpe/orchestrator/config.py` — Celery app (3 filas: fast/cfd/optimize)
- [x] `hpe/orchestrator/tasks.py` — 6 tasks Celery + _FakeTask sync fallback
- [x] `hpe/orchestrator/status.py` — Redis status tracker + in-memory fallback
- [x] `hpe/orchestrator/versions.py` — DesignVersion + save_version()
- [x] `hpe/api/websocket.py` — WS /ws/pipeline/{run_id} + POST /pipeline/run

### Fase 6 — PINN + RAG
- [x] `hpe/ai/pinn/model.py` — PumpPINN (PyTorch + numpy fallback), L_data + L_euler + L_cont
- [x] `hpe/ai/pinn/losses.py` — euler_loss, continuity_loss, efficiency_bound_loss
- [x] `hpe/ai/pinn/trainer.py` — train_pinn_from_bancada(), early stopping, MLflow
- [x] `hpe/ai/assistant/rag.py` — EngineeringAssistant, RAG local + Claude API opcional
- [x] `hpe/ai/assistant/offline_rules.py` — regras Gülich: cavitacao, eficiencia, estabilidade

---

## O Que NAO Existe Ainda

- [ ] CadQuery instalado no Docker — export STEP/STL real (todos os endpoints retornam cad_available=False)
- [x] Testes E2E completos (Fases 2-6) — `tests/test_e2e_phases_2_6.py` (53 testes, 2 skipped/Optuna)
- [ ] Docker Compose producao com uvicorn + Celery + Redis + MinIO (compose escrito, nao testado)
- [ ] Frontend: integrar PipelinePanel + AssistantChat no App.tsx principal
- [ ] Optuna instalado (`pip install optuna`) — bayesian usa random search por enquanto
- [ ] training_log populado: 460 registros bancada + 0 CFD (aguardando runs reais)

---

## Bloqueios Conhecidos

- **CadQuery**: nao instalado — `pip install cadquery` (ou usar imagem Docker pre-compilada)
- **Celery/Redis**: servicos nao rodando localmente — orchestrator usa fallback sincrono
- **Tabela bancada**: `public.hgr_lab_reg_teste` no banco `higra_sigs` (localhost:5432)
- **models/ no .gitignore**: `surrogate_v1.pkl` (~8MB) e `pinn_v1.pkl` devem ser ignorados pelo git

---

## Decisoes Tecnicas Tomadas

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Surrogate v1 | XGBoost | Dados limitados; RMSE 2.8% validado |
| Surrogate v2 | GP sklearn | Incerteza nativa; subsample 500pts para O(n3) |
| Otimizacao | NSGA-II + Optuna | Multi-objetivo; fallback se dep nao instalada |
| CFD | OpenFOAM + SU2 adjoint | Industry standard; SU2 para gradiente |
| PINN | PyTorch + numpy fallback | Portabilidade sem GPU obrigatoria |
| RAG | Local KB + Claude API opcional | Offline-first; upgradeable sem mudar interface |
| Feature store | Parquet local | Fase 1-3; migrar para S3/MinIO na Fase 4+ |
| Normalizacao | StandardScaler | Compativel com GP e PINN |

---

## Como Executar

```bash
# API
PYTHONPATH=backend/src uvicorn hpe.api.main:app --port 8000 --reload

# CLI
PYTHONPATH=backend/src python -m hpe.cli sizing --flow 0.05 --head 30 --rpm 1750

# Testes
PYTHONPATH=backend/src pytest tests/ -v

# Seed training_log
PYTHONPATH=backend/src python backend/src/hpe/data/bancada_seed.py

# Treinar PINN
PYTHONPATH=backend/src python -c "from hpe.ai.pinn.trainer import train_pinn_from_bancada; train_pinn_from_bancada(epochs=100)"
```

---

## Notas de Arquitetura

- **Nunca** substituir surrogate em producao sem versionar no MLflow primeiro
- **Sempre** registrar runs CFD no `training_log` — regra de ouro do projeto
- Surrogate e avaliador primario no loop de otimizacao; CFD apenas para validacao final
- Todos os modulos com fallback gracioso quando dependencias pesadas (CadQuery, Celery, Redis, PyTorch) nao estao instaladas
- Banco `higra_sigs` e somente leitura — nunca escrever nele
