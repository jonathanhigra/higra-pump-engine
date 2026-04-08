"""Funções de perda física para PINN de bomba centrífuga.

Cada função implementa um resíduo da equação física correspondente.
O resíduo ideal é zero — quanto menor, mais a predição satisfaz a física.

Referências:
  - Gülich (2010), Centrifugal Pumps, §3.2–§3.4
  - Raissi et al. (2019), Physics-Informed Neural Networks
"""

from __future__ import annotations

import numpy as np


G = 9.80665  # m/s² — gravidade padrão


def euler_loss(
    H_pred: np.ndarray | float,
    u2: np.ndarray | float,
    cu2: np.ndarray | float,
    u1: np.ndarray | float,
    cu1: np.ndarray | float,
    g: float = G,
) -> float:
    """Resíduo MSE da Lei de Euler de turbomáquinas.

    H_euler = (u2·cu2 − u1·cu1) / g

    O resíduo mede o quanto H_pred desvia da cabeça teórica de Euler.
    Para bomba com entrada sem pré-rotação (cu1 ≈ 0), simplifica-se para:
        H_euler = u2·cu2 / g

    Parâmetros
    ----------
    H_pred : array or float
        Cabeça predita pelo modelo [m].
    u2 : array or float
        Velocidade periférica na saída do impelidor [m/s].
    cu2 : array or float
        Componente tangencial da velocidade absoluta na saída [m/s].
    u1 : array or float
        Velocidade periférica na entrada [m/s].
    cu1 : array or float
        Componente tangencial da velocidade absoluta na entrada [m/s].
        Zero para escoamento sem pré-rotação.
    g : float
        Aceleração da gravidade [m/s²].

    Retorna
    -------
    float
        MSE entre H_pred e H_euler  ||H_pred − H_euler||².
    """
    H_pred = np.asarray(H_pred, dtype=float)
    u2 = np.asarray(u2, dtype=float)
    cu2 = np.asarray(cu2, dtype=float)
    u1 = np.asarray(u1, dtype=float)
    cu1 = np.asarray(cu1, dtype=float)

    H_euler = (u2 * cu2 - u1 * cu1) / g
    residual = H_pred - H_euler
    return float(np.mean(residual ** 2))


def continuity_loss(
    Q: np.ndarray | float,
    cm1: np.ndarray | float,
    A1: np.ndarray | float,
    cm2: np.ndarray | float,
    A2: np.ndarray | float,
) -> float:
    """Resíduo MSE da equação de continuidade (conservação de massa).

    Q = cm1·A1 = cm2·A2  (fluido incompressível)

    Penaliza violações da conservação de massa nas seções de entrada (1)
    e saída (2) do impelidor.

    Parâmetros
    ----------
    Q : array or float
        Vazão volumétrica [m³/s].
    cm1 : array or float
        Velocidade meridional na entrada [m/s].
    A1 : array or float
        Área da seção de entrada [m²].
    cm2 : array or float
        Velocidade meridional na saída [m/s].
    A2 : array or float
        Área da seção de saída [m²].

    Retorna
    -------
    float
        ||Q − cm1·A1||² + ||Q − cm2·A2||²
    """
    Q = np.asarray(Q, dtype=float)
    cm1 = np.asarray(cm1, dtype=float)
    A1 = np.asarray(A1, dtype=float)
    cm2 = np.asarray(cm2, dtype=float)
    A2 = np.asarray(A2, dtype=float)

    res1 = Q - cm1 * A1
    res2 = Q - cm2 * A2
    return float(np.mean(res1 ** 2) + np.mean(res2 ** 2))


def efficiency_bound_loss(eta_pred: np.ndarray | float) -> float:
    """Penalidade suave para eficiência fora dos limites físicos [0.30, 0.97].

    Usa uma função relu softplus para penalizar predições impossíveis:
        - eta < 0.30 → perda crescente (bomba não funciona abaixo disso)
        - eta > 0.97 → perda crescente (limite termodinâmico prático)

    Parâmetros
    ----------
    eta_pred : array or float
        Eficiência predita (dimensionless, 0–1).

    Retorna
    -------
    float
        Soma das penalidades para predições fora do intervalo físico.
    """
    eta = np.asarray(eta_pred, dtype=float)

    # Penalidade por eta abaixo do mínimo (0.30)
    eta_min = 0.30
    penalty_low = np.maximum(0.0, eta_min - eta) ** 2

    # Penalidade por eta acima do máximo (0.97)
    eta_max = 0.97
    penalty_high = np.maximum(0.0, eta - eta_max) ** 2

    return float(np.mean(penalty_low + penalty_high))


def total_pinn_loss(
    data_loss: float,
    euler_res: float,
    cont_res: float,
    lambda_euler: float = 1.0,
    lambda_cont: float = 0.5,
    eta_bound_res: float = 0.0,
    lambda_bound: float = 0.2,
) -> float:
    """Perda total ponderada do PINN.

    L_total = L_data + λ_euler·L_euler + λ_cont·L_cont + λ_bound·L_bound

    A ponderação equilibra a fidelidade aos dados com o respeito à física.
    λ_euler = 1.0 garante que a lei de Euler seja bem satisfeita.
    λ_cont = 0.5 penaliza violações de massa com menor peso.

    Parâmetros
    ----------
    data_loss : float
        MSE entre predições e dados de bancada.
    euler_res : float
        Resíduo da lei de Euler (saída de euler_loss).
    cont_res : float
        Resíduo da continuidade (saída de continuity_loss).
    lambda_euler : float
        Peso do resíduo de Euler na perda total.
    lambda_cont : float
        Peso do resíduo de continuidade.
    eta_bound_res : float
        Penalidade de limite físico de eficiência (saída de efficiency_bound_loss).
    lambda_bound : float
        Peso da penalidade de limite de eficiência.

    Retorna
    -------
    float
        Perda total PINN.
    """
    return (
        data_loss
        + lambda_euler * euler_res
        + lambda_cont * cont_res
        + lambda_bound * eta_bound_res
    )
