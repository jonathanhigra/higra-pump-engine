-- HPE (Higra Pump Engine) Database Schema
-- PostgreSQL 14+
-- Run once to initialize: psql -U postgres -d db_pump_engine -f schema.sql

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    company     TEXT,
    password_hash TEXT,
    role        TEXT NOT NULL DEFAULT 'engineer',  -- engineer | admin
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    machine_type TEXT NOT NULL DEFAULT 'centrifugal_pump',
    status      TEXT NOT NULL DEFAULT 'draft',  -- draft | active | archived
    tags        TEXT[],
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- ─── Designs (sizing runs) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS designs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT,
    -- Operating point
    flow_rate_m3s   DOUBLE PRECISION NOT NULL,
    head_m          DOUBLE PRECISION NOT NULL,
    rpm             DOUBLE PRECISION NOT NULL,
    fluid_density   DOUBLE PRECISION DEFAULT 998.0,
    machine_type    TEXT DEFAULT 'centrifugal_pump',
    -- Sizing results
    nq              DOUBLE PRECISION,
    impeller_type   TEXT,
    d2_m            DOUBLE PRECISION,
    d1_m            DOUBLE PRECISION,
    b2_m            DOUBLE PRECISION,
    blade_count     INTEGER,
    beta1_deg       DOUBLE PRECISION,
    beta2_deg       DOUBLE PRECISION,
    eta_total       DOUBLE PRECISION,
    power_w         DOUBLE PRECISION,
    npsh_r          DOUBLE PRECISION,
    sigma           DOUBLE PRECISION,
    -- Advanced results
    diffusion_ratio     DOUBLE PRECISION,
    throat_area_m2      DOUBLE PRECISION,
    slip_factor         DOUBLE PRECISION,
    pmin_pa             DOUBLE PRECISION,
    convergence_iters   INTEGER,
    tip_clearance_loss  DOUBLE PRECISION,
    roughness_loss      DOUBLE PRECISION,
    endwall_loss        DOUBLE PRECISION,
    leakage_loss_m      DOUBLE PRECISION,
    profile_loss_total  DOUBLE PRECISION,
    -- Warnings
    warnings        TEXT[],
    -- Full result JSON (for complete reconstruction)
    result_json     JSONB,
    -- Overrides used
    override_d2     DOUBLE PRECISION,
    override_b2     DOUBLE PRECISION,
    override_d1     DOUBLE PRECISION,
    tip_clearance_mm DOUBLE PRECISION,
    roughness_ra_um  DOUBLE PRECISION,
    -- Meta
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_starred      BOOLEAN DEFAULT FALSE,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_designs_project ON designs(project_id);
CREATE INDEX IF NOT EXISTS idx_designs_nq ON designs(nq);
CREATE INDEX IF NOT EXISTS idx_designs_eta ON designs(eta_total);

-- ─── Performance curves ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_curves (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    design_id   UUID REFERENCES designs(id) ON DELETE CASCADE,
    -- Each row = one curve point
    flow_rate_m3s   DOUBLE PRECISION NOT NULL,
    head_m          DOUBLE PRECISION NOT NULL,
    efficiency      DOUBLE PRECISION,
    power_w         DOUBLE PRECISION,
    npsh_r          DOUBLE PRECISION,
    is_unstable     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_design ON performance_curves(design_id);

-- ─── Optimization runs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS optimization_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT,
    algorithm       TEXT NOT NULL DEFAULT 'nsga2',  -- nsga2 | bayesian | gradient
    n_generations   INTEGER,
    population_size INTEGER,
    objectives      TEXT[],      -- e.g. ['maximize_eta', 'minimize_npsh']
    variables       JSONB,       -- variable bounds
    status          TEXT DEFAULT 'pending',  -- pending | running | done | failed
    best_eta        DOUBLE PRECISION,
    best_design_id  UUID REFERENCES designs(id),
    pareto_front    JSONB,       -- list of non-dominated solutions
    history         JSONB,       -- per-generation convergence
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_optim_project ON optimization_runs(project_id);

-- ─── Surrogate models ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surrogate_models (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID REFERENCES projects(id),
    name            TEXT NOT NULL,
    model_type      TEXT NOT NULL DEFAULT 'random_forest',
    target          TEXT NOT NULL,  -- 'eta' | 'npsh' | 'power'
    n_samples       INTEGER,
    r2_train        DOUBLE PRECISION,
    r2_cv           DOUBLE PRECISION,
    mae_cv          DOUBLE PRECISION,
    feature_names   TEXT[],
    model_path      TEXT,           -- path to saved .pkl/.pt file
    metrics_json    JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

-- ─── DoE experiments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doe_experiments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID REFERENCES projects(id),
    name            TEXT,
    n_points        INTEGER,
    n_variables     INTEGER,
    variable_names  TEXT[],
    bounds_json     JSONB,       -- [[lo, hi], ...] per variable
    points_json     JSONB,       -- the actual design matrix
    min_distance    DOUBLE PRECISION,
    coverage_metric DOUBLE PRECISION,
    seed            INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Bench test data (for validation against real tests) ─────────────────────
CREATE TABLE IF NOT EXISTS bench_tests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    design_id       UUID REFERENCES designs(id),
    test_date       DATE,
    operator        TEXT,
    -- Measured values
    flow_rate_m3s   DOUBLE PRECISION,
    head_m          DOUBLE PRECISION,
    rpm_measured    DOUBLE PRECISION,
    power_measured  DOUBLE PRECISION,
    eta_measured    DOUBLE PRECISION,
    npsh_measured   DOUBLE PRECISION,
    -- Deviations vs prediction
    eta_deviation   DOUBLE PRECISION,   -- measured - predicted
    head_deviation  DOUBLE PRECISION,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RSM models ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsm_models (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id        TEXT UNIQUE NOT NULL,  -- key used in API
    n_variables     INTEGER,
    n_coefficients  INTEGER,
    r2_train        DOUBLE PRECISION,
    variable_names  TEXT[],
    coefficients    DOUBLE PRECISION[],
    x_mean          DOUBLE PRECISION[],
    x_std           DOUBLE PRECISION[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Trigger: update updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_projects_updated
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Default data ─────────────────────────────────────────────────────────────
INSERT INTO users (id, name, email, company, role)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'HIGRA Admin',
    'admin@higra.com.br',
    'HIGRA Industrial Ltda.',
    'admin'
) ON CONFLICT (email) DO NOTHING;
