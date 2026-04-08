"""PINN training pipeline — treina PumpPINN com dados bancada + restrições físicas.

Pipeline completo:
  1. Carrega features de bancada_features.parquet via FeatureStore
  2. Prepara features e targets compatíveis com PumpPINN
  3. Divide em treino/validação (estratificado por faixa de Ns)
  4. Treina PumpPINN (PyTorch ou numpy fallback)
  5. Avalia RMSE de eficiência no conjunto de validação
  6. Registra métricas no MLflow (graceful degradation)
  7. Salva modelo em models/pinn_v1.pkl

Critério de aceite: val_rmse_eta < 0.05 (5 pp)

Referências:
  - Raissi et al. (2019), Physics-informed neural networks, JCP
  - Gülich (2010), Centrifugal Pumps, §3.2
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Resultado do treinamento
# ---------------------------------------------------------------------------

@dataclass
class PINNTrainingResult:
    """Resultado do pipeline de treinamento do PINN.

    Atributos
    ----------
    model_path : str
        Caminho onde o modelo foi salvo.
    n_train : int
        Número de amostras no conjunto de treino.
    n_val : int
        Número de amostras no conjunto de validação.
    final_loss_data : float
        Perda de dados (MSE) na última época.
    final_loss_physics : float
        Perda física (Euler + continuidade) na última época.
    final_loss_total : float
        Perda total na última época.
    val_rmse_eta : float
        RMSE de eficiência total no conjunto de validação [fração 0–1].
    epochs_ran : int
        Número de épocas efetivamente executadas.
    runtime_s : float
        Tempo de treinamento em segundos.
    mlflow_run_id : str | None
        ID do run no MLflow, ou None se MLflow não disponível.
    passes_criterion : bool
        True se val_rmse_eta < 0.05 (5pp) — critério de aceite.
    """
    model_path: str
    n_train: int
    n_val: int
    final_loss_data: float
    final_loss_physics: float
    final_loss_total: float
    val_rmse_eta: float
    epochs_ran: int
    runtime_s: float
    mlflow_run_id: Optional[str] = None
    passes_criterion: bool = False


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------

def _prepare_features(df) -> tuple[np.ndarray, np.ndarray]:
    """Prepara arrays de features e targets a partir do DataFrame de bancada.

    Features de entrada para o PINN (5 colunas):
      [feat_ns, feat_u2, feat_phi, feat_psi, feat_re_log10]

    Targets (2 colunas):
      [eta_total_frac, eta_hid_frac]

    Parâmetros
    ----------
    df : pd.DataFrame
        DataFrame carregado pelo FeatureStore.

    Retorna
    -------
    X : np.ndarray, shape (n, 5)
    y : np.ndarray, shape (n, 2)
    """
    # Colunas requeridas
    required = ["feat_ns", "feat_u2", "feat_phi", "feat_psi", "feat_re", "eta_total", "eta_hid"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Colunas ausentes no dataset: {missing}")

    # Re_log10: feat_re já deve estar em escala log10 ou Reynolds absoluto
    # Verificar escala: se valores típicos >> 10, estamos em Reynolds absoluto
    re_vals = df["feat_re"].dropna()
    if re_vals.median() > 100:
        # Provavelmente Reynolds em escala absoluta — converter para log10
        re_feature = np.log10(np.clip(df["feat_re"].values, 1e4, 1e8))
    else:
        # Já está em log10 ou normalizado
        re_feature = df["feat_re"].values

    X = np.column_stack([
        df["feat_ns"].values,
        df["feat_u2"].values,
        df["feat_phi"].values,
        df["feat_psi"].values,
        re_feature,
    ]).astype(np.float64)

    # Targets: converter de % para fração se necessário
    eta_total = df["eta_total"].values
    eta_hid = df["eta_hid"].values

    if eta_total.max() > 1.5:
        # Valores em percentual — converter para fração
        eta_total = eta_total / 100.0
        eta_hid = eta_hid / 100.0

    y = np.column_stack([eta_total, eta_hid]).astype(np.float64)

    return X, y


def _train_val_split(
    X: np.ndarray,
    y: np.ndarray,
    ns_values: np.ndarray,
    test_size: float = 0.20,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Divide em treino/validação com estratificação aproximada por faixa de Ns.

    Parâmetros
    ----------
    X, y : arrays de features e targets
    ns_values : velocidade específica (para estratificação)
    test_size : fração do conjunto de validação
    seed : semente aleatória

    Retorna
    -------
    X_train, X_val, y_train, y_val
    """
    rng = np.random.default_rng(seed)
    n = len(X)

    # Estratificar por faixa de Ns
    bins = [0, 20, 40, 70, 120, 300, np.inf]
    strata = np.digitize(ns_values, bins)

    val_idx: list[int] = []
    for s in np.unique(strata):
        mask = np.where(strata == s)[0]
        n_val_s = max(1, int(round(len(mask) * test_size)))
        chosen = rng.choice(mask, size=n_val_s, replace=False)
        val_idx.extend(chosen.tolist())

    val_idx_arr = np.array(val_idx, dtype=int)
    train_idx_arr = np.setdiff1d(np.arange(n), val_idx_arr)

    return X[train_idx_arr], X[val_idx_arr], y[train_idx_arr], y[val_idx_arr]


def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """RMSE escalar."""
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def _try_mlflow_start(
    run_name: str,
    params: dict,
) -> tuple[object | None, str | None]:
    """Tenta iniciar run no MLflow; retorna (run, run_id) ou (None, None)."""
    try:
        import mlflow
        run = mlflow.start_run(run_name=run_name)
        mlflow.log_params(params)
        return run, run.info.run_id
    except Exception as exc:
        log.debug("MLflow não disponível: %s", exc)
        return None, None


def _try_mlflow_log(run, metrics: dict) -> None:
    """Loga métricas no MLflow com graceful degradation."""
    if run is None:
        return
    try:
        import mlflow
        mlflow.log_metrics(metrics)
    except Exception as exc:
        log.debug("MLflow log_metrics falhou: %s", exc)


def _try_mlflow_end(run) -> None:
    """Finaliza run MLflow com graceful degradation."""
    if run is None:
        return
    try:
        import mlflow
        mlflow.end_run()
    except Exception as exc:
        log.debug("MLflow end_run falhou: %s", exc)


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def train_pinn_from_bancada(
    features_path: Optional[str] = None,
    model_path: Optional[str] = None,
    epochs: int = 200,
    batch_size: int = 64,
    lr: float = 1e-3,
    lambda_euler: float = 0.1,
    lambda_continuity: float = 0.05,
    test_size: float = 0.20,
    seed: int = 42,
) -> PINNTrainingResult:
    """Treina PumpPINN com dados de bancada.

    Carrega features de bancada_features.parquet via FeatureStore.

    Features de entrada: [feat_ns, feat_u2, feat_psi, feat_phi, feat_re_log10]
    Targets: [eta_total/100, eta_hid/100]

    Com PyTorch: Adam + early stopping em 20 épocas sem melhora no val loss.
    Sem PyTorch: gradient descent manual (numpy fallback).

    MLflow: rastreia métricas com graceful degradation.
    Salva modelo em models/pinn_v1.pkl.

    Parâmetros
    ----------
    features_path : str | None
        Caminho para bancada_features.parquet. Se None, usa FeatureStore padrão.
    model_path : str | None
        Caminho de saída do modelo. Se None, usa models/pinn_v1.pkl.
    epochs : int
        Número máximo de épocas de treinamento.
    batch_size : int
        Tamanho do mini-batch.
    lr : float
        Taxa de aprendizado (Adam).
    lambda_euler : float
        Peso da perda de Euler.
    lambda_continuity : float
        Peso da perda de continuidade.
    test_size : float
        Fração para validação (0–1).
    seed : int
        Semente aleatória para reprodutibilidade.

    Retorna
    -------
    PINNTrainingResult
        Resultado completo com métricas, caminho do modelo e critério de aceite.
    """
    from hpe.ai.pinn.model import PINNConfig, PumpPINN
    from hpe.data.feature_store import FeatureStore

    t0 = time.perf_counter()

    # ------------------------------------------------------------------
    # 1. Carregar dados
    # ------------------------------------------------------------------
    log.info("PINN trainer: carregando features...")
    if features_path is not None:
        import pandas as pd
        df = pd.read_parquet(features_path)
        log.info("PINN trainer: carregado de %s (%d rows)", features_path, len(df))
    else:
        fs = FeatureStore()
        df = fs.load_bancada()
        log.info("PINN trainer: carregado via FeatureStore (%d rows)", len(df))

    # ------------------------------------------------------------------
    # 2. Preparar features e targets
    # ------------------------------------------------------------------
    X, y = _prepare_features(df)
    ns_values = df["feat_ns"].values

    # Remover NaN
    valid = np.all(np.isfinite(X), axis=1) & np.all(np.isfinite(y), axis=1)
    X, y, ns_values = X[valid], y[valid], ns_values[valid]
    log.info("PINN trainer: %d amostras válidas (descartadas: %d)", valid.sum(), (~valid).sum())

    # ------------------------------------------------------------------
    # 3. Split treino/validação
    # ------------------------------------------------------------------
    X_train, X_val, y_train, y_val = _train_val_split(X, y, ns_values, test_size, seed)
    n_train, n_val = len(X_train), len(X_val)
    log.info("PINN trainer: treino=%d, validação=%d", n_train, n_val)

    # ------------------------------------------------------------------
    # 4. Configurar e treinar o PINN
    # ------------------------------------------------------------------
    config = PINNConfig(
        hidden_dims=[64, 64, 32],
        lr=lr,
        n_epochs=epochs,
        lambda_euler=lambda_euler,
        lambda_cont=lambda_continuity,
        batch_size=batch_size,
    )
    pinn = PumpPINN(config)

    # Iniciar MLflow
    mlflow_params = {
        "epochs": epochs,
        "batch_size": batch_size,
        "lr": lr,
        "lambda_euler": lambda_euler,
        "lambda_continuity": lambda_continuity,
        "n_train": n_train,
        "n_val": n_val,
        "backend": pinn._backend,
    }
    mlflow_run, mlflow_run_id = _try_mlflow_start("pinn_v1_training", mlflow_params)

    log.info("PINN trainer: iniciando treinamento (backend=%s, epochs=%d)...", pinn._backend, epochs)

    # Early stopping wrapper
    best_val_rmse = float("inf")
    best_epoch = 0
    patience = 20
    history_full: list[dict] = []

    # Para early stopping, treinamos em blocos de 10 épocas
    block_size = 10
    epochs_ran = 0
    final_loss_data = 0.0
    final_loss_physics = 0.0
    final_loss_total = 0.0

    # Treinamento em blocos para permitir early stopping
    for block_start in range(0, epochs, block_size):
        block_epochs = min(block_size, epochs - block_start)
        config_block = PINNConfig(
            hidden_dims=[64, 64, 32],
            lr=lr * (0.5 ** (block_start // 200)),  # decaimento manual
            n_epochs=block_epochs,
            lambda_euler=lambda_euler,
            lambda_cont=lambda_continuity,
            batch_size=batch_size,
        )

        # Re-usar o impl existente — ajustar configuração
        pinn.config = config_block
        pinn._impl.config = config_block

        train_result = pinn._impl.fit(X_train, y_train, verbose=False)
        pinn._trained = True

        epochs_ran = block_start + block_epochs
        final_loss_total = train_result["final_loss"]

        # Decomposição aproximada da perda (data vs physics)
        # Estimar perda de dados pura: MSE(y_pred, y_train)
        y_pred_train = pinn._impl.predict(X_train)
        data_loss = float(np.mean((y_pred_train - y_train) ** 2))
        physics_loss = max(0.0, final_loss_total - data_loss)
        final_loss_data = data_loss
        final_loss_physics = physics_loss

        # Avaliar validação
        y_pred_val = pinn._impl.predict(X_val)
        val_rmse = _rmse(y_val[:, 0], y_pred_val[:, 0])  # eta_total

        history_full.append({
            "epoch": epochs_ran,
            "loss_total": final_loss_total,
            "loss_data": data_loss,
            "val_rmse_eta": val_rmse,
        })

        # Log a cada bloco
        _try_mlflow_log(mlflow_run, {
            "val_rmse_eta": val_rmse,
            "loss_data": data_loss,
            "loss_total": final_loss_total,
        })

        if val_rmse < best_val_rmse:
            best_val_rmse = val_rmse
            best_epoch = epochs_ran

        log.debug(
            "PINN trainer: época %d/%d — loss=%.5f, val_rmse_eta=%.4f",
            epochs_ran, epochs, final_loss_total, val_rmse,
        )

        # Early stopping
        if epochs_ran - best_epoch >= patience:
            log.info(
                "PINN trainer: early stopping na época %d (melhor: época %d, val_rmse=%.4f)",
                epochs_ran, best_epoch, best_val_rmse,
            )
            break

    # ------------------------------------------------------------------
    # 5. Avaliação final
    # ------------------------------------------------------------------
    y_pred_val_final = pinn._impl.predict(X_val)
    val_rmse_eta = _rmse(y_val[:, 0], y_pred_val_final[:, 0])
    passes_criterion = val_rmse_eta < 0.05

    log.info(
        "PINN trainer: treinamento concluído — val_rmse_eta=%.4f (%s critério 5pp)",
        val_rmse_eta,
        "APROVADO" if passes_criterion else "NÃO PASSOU NO",
    )

    # ------------------------------------------------------------------
    # 6. Salvar modelo
    # ------------------------------------------------------------------
    if model_path is None:
        repo_root = Path(__file__).resolve().parents[5]
        model_path = str(repo_root / "models" / "pinn_v1.pkl")

    Path(model_path).parent.mkdir(parents=True, exist_ok=True)
    pinn.save(model_path)
    log.info("PINN trainer: modelo salvo em %s", model_path)

    # ------------------------------------------------------------------
    # 7. Finalizar MLflow
    # ------------------------------------------------------------------
    _try_mlflow_log(mlflow_run, {
        "val_rmse_eta_final": val_rmse_eta,
        "epochs_ran": epochs_ran,
        "passes_criterion": float(passes_criterion),
    })
    _try_mlflow_end(mlflow_run)

    runtime_s = time.perf_counter() - t0

    return PINNTrainingResult(
        model_path=model_path,
        n_train=n_train,
        n_val=n_val,
        final_loss_data=final_loss_data,
        final_loss_physics=final_loss_physics,
        final_loss_total=final_loss_total,
        val_rmse_eta=val_rmse_eta,
        epochs_ran=epochs_ran,
        runtime_s=runtime_s,
        mlflow_run_id=mlflow_run_id,
        passes_criterion=passes_criterion,
    )
