# HPE — Context (Estado Atual)

> Atualizar este arquivo ao final de cada sessao de desenvolvimento.
> Este e o primeiro documento que o Claude Code deve ler apos o CLAUDE.md.

---

## Estado Geral

- **Data**: Abril 2026
- **Fase atual**: 1 — MVP (Meanline + ETL)
- **Progresso da Fase 1**: ~65% — ETL, surrogate v1, API FastAPI, M1.8 validação concluídos
- **Proximo marco**: Fix ETL (Nq bins), expor API em produção (uvicorn), testes de integração

---

## O Que Ja Existe

### Monorepo (estrutura criada)
```
hpe-project/
├── CLAUDE.md                  # Contexto master (atualizado — v3.0 AI-Native)
├── CONTEXT.md                 # Este arquivo
├── backend/
│   ├── pyproject.toml         # Dependencias Python definidas
│   ├── Dockerfile
│   └── src/hpe/               # Pacote principal (vazio — a implementar)
├── frontend/
│   ├── package.json           # React 18 + TypeScript + Three.js
│   └── Dockerfile
├── docker-compose.yml         # PostgreSQL, Redis, MinIO, Celery
└── skills/                    # Skill files por fase (a criar)
```

### Documentos de arquitetura
- `HPE_Arquitetura_v2.pdf` — documento base com analise competitiva vs ADT
- `HPE_Evolucao_AI_Native.pdf` — revisao de visao v3.0 (pipeline design inverso, surrogate CFD)

### Banco de dados (ja existe, externo)
- **Host**: PostgreSQL HIGRA (producao)
- **Schema**: `sigs`
- **Tabela critica**: `sigs.teste_bancada` — 4.036 linhas × 91 colunas (ensaios reais de bancada)
- **Conexao**: configurar via `.env` com `DATABASE_URL`

---

## O Que Ja Existe (implementado)

- [x] ETL do banco de bancada (`hpe/data/bancada_etl.py`)
  - Fonte: `hgr_lab_reg_teste` no `higra_sigs` (4.165 linhas, 91 colunas)
  - Output: `dataset/bancada_features.parquet` (2.931 linhas, 35 colunas)
  - Features: Ns, Nq, u2, psi, phi, Re, q_star, h_star + raws
- [x] Schema `hpe.training_log` no PostgreSQL (`db_pump_engine`)
  - 26 colunas: geometria, condicoes, targets, qualidade, metadados
- [x] Surrogate model v1 (`hpe/ai/surrogate/v1_xgboost.py`)
  - XGBoost multi-output (eta_total, eta_hid, p_kw)
  - RMSE: 2.8% / 2.9% / 3.0% — TODOS ABAIXO DOS 8% de criterio
  - R2: 0.986 / 0.986 / 0.998
  - Latencia: ~4ms CPU
  - Salvo em `models/surrogate_v1.pkl`, rastreado no MLflow
- [x] 12 skill files em `.claude/skills/` (00 a 11)
- [x] Frontend React + TypeScript (20 melhorias UX implementadas)
- [x] API FastAPI v2.0 (`hpe/api/main.py`) — POST /sizing/run, POST /surrogate/predict, GET /surrogate/similar, GET /health
- [x] SurrogateEvaluator (`hpe/ai/surrogate/evaluator.py`) — interface versao-agnostica
- [x] FeatureStore (`hpe/data/feature_store.py`) — acesso centralizado aos datasets Parquet
- [x] training_log.py — insert_entry, query_similar, insert_from_sizing, get_stats
- [x] M1.8 Validacao Integrada (`tests/regression/test_validation_bancada.py`)
  - 435 pontos sizing 1D vs bancada HIGRA — MAPE 11.69% < 15% (APROVADO)
  - Bias: +7.65pp (super-estimado — esperado: design otimo vs rotor trimado)
  - Relatorio: `dataset/validation_m1_8_report.json`

## O Que NAO Existe Ainda (a implementar)

- [ ] Fix ETL: Nq distribution bins usa feat_nq adimensional em vez de feat_ns (Ns europeu)
- [ ] Geometria parametrica (`hpe/geometry/`) — CadQuery
- [ ] Pipeline CFD (`hpe/cfd/`)
- [ ] Integracao `training_log` ← resultados CFD (retroalimentacao)
- [ ] Testes de integracao da API (pytest + httpx TestClient)

---

## Proxima Tarefa Imediata

### TAREFA 4 — Fix ETL Nq Distribution Bins

**Arquivo**: `backend/src/hpe/data/bancada_etl.py`

**Problema**: A coluna `nq_distribution` no ETL usa `feat_nq` (adimensional, ~0.1–1.0)
nos bins 0–300 (escala de Nq europeu). Resultado: todos os 2931 registros caem no bin
"radial_hp". O correto e usar `feat_ns` (Ns dimensional, ~10–100) para classificar
o tipo de impelsor.

**Correcao**:
```python
# ERRADO — atual
df["nq_distribution"] = pd.cut(df["feat_nq"], bins=[0,20,60,120,200,300], ...)

# CORRETO — usar feat_ns
df["nq_distribution"] = pd.cut(df["feat_ns"], bins=[0,15,30,50,80,120,300],
    labels=["radial_lp","radial","radial_hp","mixed","axial","out_of_range"])
```

---

### TAREFA 1 — ETL do Banco de Bancada ✅ CONCLUIDA

**Arquivo a criar**: `backend/src/hpe/data/bancada_etl.py`

**Objetivo**: Transformar `sigs.teste_bancada` em dataset de ML normalizado.

**Passos**:
1. Conectar ao PostgreSQL via `DATABASE_URL` do `.env`
2. Inspecionar as 91 colunas da tabela e identificar as relevantes para ML
3. Calcular features derivadas:
   - `Ns` = velocidade especifica (n * Q^0.5 / H^0.75)
   - `Nq` = velocidade especifica europeia (n * Q^0.5 / H^0.75 / 51.65)
   - `psi` = coeficiente de pressao (g * H / (u2^2))
   - `phi` = coeficiente de vazao (Q / (u2 * D2^2 * pi/4))
   - `lambda_` = coeficiente de potencia
4. Normalizar features (StandardScaler ou MinMaxScaler)
5. Salvar em `dataset/bancada_features.parquet`
6. Gerar relatorio de qualidade: % de nulos, distribuicoes, outliers

**Output esperado**:
```
dataset/
├── bancada_features.parquet   # Features normalizadas para ML
├── bancada_raw.parquet        # Copia raw para referencia
└── etl_report.json            # Relatorio de qualidade dos dados
```

**Validacao**: Script deve logar quantas linhas foram processadas, 
quantas descartadas (nulos/outliers) e o schema final de features.

---

### TAREFA 2 — Schema training_log ✅ CONCLUIDA

**Objetivo**: Criar tabela no PostgreSQL para registrar cada simulacao CFD 
como ponto de treino adicional para o surrogate.

**Schema proposto**:
```sql
CREATE TABLE hpe.training_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id      UUID,
    fonte           TEXT NOT NULL,       -- 'bancada' | 'cfd_openfoam' | 'cfd_su2'
    -- Inputs geometricos
    ns              FLOAT,
    d1_mm           FLOAT,
    d2_mm           FLOAT,
    b2_mm           FLOAT,
    beta1_deg       FLOAT,
    beta2_deg       FLOAT,
    n_rpm           FLOAT,
    z_palhetas      INTEGER,
    -- Condicoes operacionais
    q_m3h           FLOAT,
    h_m             FLOAT,
    n_rot           FLOAT,
    -- Outputs de performance (targets do surrogate)
    eta_hid         FLOAT,
    eta_total       FLOAT,
    p_shaft_kw      FLOAT,
    npsh_r_m        FLOAT,
    -- Metadata
    qualidade       FLOAT,              -- score de confianca do dado (0-1)
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON hpe.training_log (ns, d2_mm);
CREATE INDEX ON hpe.training_log (fonte, created_at DESC);
```

---

### TAREFA 3 — Surrogate v1 ✅ CONCLUIDA

**Arquivo a criar**: `backend/src/hpe/ai/surrogate/v1_xgboost.py`

**Objetivo**: Primeiro surrogate model. Prediz `eta`, `H`, `P` dado `Ns` e geometria basica.

**Interface esperada**:
```python
class SurrogateV1:
    def train(self, features_path: str) -> TrainingResult: ...
    def predict(self, input: SurrogateInput) -> SurrogateOutput: ...
    def evaluate(self, test_set: pd.DataFrame) -> EvalMetrics: ...
    def save(self, path: str) -> None: ...
    def load(self, path: str) -> None: ...
```

**Criterio de aceite**: RMSE ≤ 8% vs dados de bancada no conjunto de teste (20% holdout).

---

## Decisoes Tecnicas Tomadas

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Surrogate inicial | XGBoost (nao PyTorch) | Dados limitados inicialmente; XGBoost performa melhor com <10k amostras |
| Feature store | Parquet local (nao banco) | Simplicidade na Fase 1; migrar para S3/MinIO na Fase 3 |
| Normalizacao | StandardScaler | Compativel com GP (Fase 3) e facilita interpretacao dos coeficientes |
| Versionamento de modelos | MLflow local | Simples de iniciar; compativel com MLflow remoto futuro |
| Validacao do surrogate | 80/20 split + k-fold | Dataset pequeno — k-fold da estimativa mais robusta |

---

## Bloqueios Conhecidos

- **Tabela de bancada**: A tabela nao e `sigs.teste_bancada` mas sim `public.hgr_lab_reg_teste` no banco `higra_sigs` (localhost:5432). ETL conecta via `DATABASE_SIGS_URL` no `.env`.
- **Nq distribution bins**: O ETL usa `feat_nq` (adimensional ~0.1-1.0) nos bins de Nq europeu (0-300). O correto e usar `feat_ns` nos bins. Ver TAREFA 4 acima.
- **CadQuery no Docker**: Instalacao do CadQuery pode ser complexa no container — avaliar imagem base
- **models/ no .gitignore**: Verificar se `models/surrogate_v1.pkl` deve ser versionado ou ignorado (arquivo ~8MB)

---

## Notas de Arquitetura

- **Nunca** substituir o surrogate em producao sem versionar no MLflow primeiro
- **Sempre** registrar runs CFD no `training_log` — e regra de ouro do projeto
- O surrogate e avaliador primario no loop de otimizacao; CFD real apenas para validacao do design final
- O modulo `hpe.data.bancada_etl` deve ser idempotente — pode ser re-executado sem duplicar dados

---

## Como Atualizar Este Arquivo

Ao final de cada sessao de desenvolvimento, atualizar:
1. `Progresso da Fase 1` (percentual estimado)
2. Checkboxes em `O Que NAO Existe Ainda`
3. `Proxima Tarefa Imediata` (remover a concluida, promover a seguinte)
4. `Bloqueios Conhecidos` (adicionar novos, remover resolvidos)
5. `Decisoes Tecnicas Tomadas` (documentar escolhas relevantes feitas na sessao)