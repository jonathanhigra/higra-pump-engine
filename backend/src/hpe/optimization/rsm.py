"""Response Surface Model — polynomial regression on DoE results.

Fits a quadratic polynomial to DoE evaluation results for fast
surrogate-based optimization.

References:
    Box & Wilson (1951) — RSM original paper.
    Myers et al. (2016) — Response Surface Methodology.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class RSMModel:
    """Fitted polynomial response surface."""

    n_variables: int
    coefficients: list[float]   # Polynomial coefficients
    r2_train: float             # R² on training data
    variable_names: list[str]
    _x_mean: list[float] = field(default=None, repr=False)
    _x_std: list[float] = field(default=None, repr=False)


def fit_rsm(
    X: list[list[float]],   # Design matrix [n_points × n_vars]
    y: list[float],          # Responses [n_points]
    variable_names: list[str] = None,
) -> RSMModel:
    """Fit quadratic polynomial RSM using least squares.

    Polynomial: y = β₀ + Σβᵢxᵢ + Σβᵢᵢxᵢ² + Σβᵢⱼxᵢxⱼ
    Uses normal equations: β = (XᵀX)⁻¹Xᵀy
    """
    n = len(X)
    k = len(X[0]) if X else 0

    if variable_names is None:
        variable_names = [f"x{i}" for i in range(k)]

    # Normalize X
    x_mean = [sum(X[i][j] for i in range(n)) / n for j in range(k)]
    x_std = [
        max(
            1e-9,
            math.sqrt(sum((X[i][j] - x_mean[j]) ** 2 for i in range(n)) / n),
        )
        for j in range(k)
    ]

    Xn = [[(X[i][j] - x_mean[j]) / x_std[j] for j in range(k)] for i in range(n)]

    # Build quadratic feature matrix (intercept + linear + quadratic + cross)
    Phi = []
    for i in range(n):
        row = [1.0]  # intercept
        row.extend(Xn[i])  # linear
        row.extend(Xn[i][j] ** 2 for j in range(k))  # quadratic
        # Cross terms (only if not too many variables)
        if k <= 6:
            for a in range(k):
                for b in range(a + 1, k):
                    row.append(Xn[i][a] * Xn[i][b])
        Phi.append(row)

    # Solve via normal equations with ridge regularization λ=1e-6
    m = len(Phi[0])

    # XᵀX
    XtX = [
        [sum(Phi[i][a] * Phi[i][b] for i in range(n)) for b in range(m)]
        for a in range(m)
    ]
    for a in range(m):
        XtX[a][a] += 1e-6  # ridge

    # Xᵀy
    Xty = [sum(Phi[i][a] * y[i] for i in range(n)) for a in range(m)]

    # Solve XtX β = Xty using Gaussian elimination
    beta = _solve_linear_system(XtX, Xty)

    # R²
    y_mean = sum(y) / n
    ss_tot = sum((yi - y_mean) ** 2 for yi in y)
    y_pred = [sum(beta[a] * Phi[i][a] for a in range(m)) for i in range(n)]
    ss_res = sum((y[i] - y_pred[i]) ** 2 for i in range(n))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 1.0

    model = RSMModel(
        n_variables=k,
        coefficients=beta,
        r2_train=round(max(0.0, r2), 4),
        variable_names=variable_names,
    )
    model._x_mean = x_mean
    model._x_std = x_std
    return model


def predict_rsm(model: RSMModel, x: list[float]) -> float:
    """Predict response at new point x."""
    k = model.n_variables
    xn = [(x[j] - model._x_mean[j]) / model._x_std[j] for j in range(k)]

    row = [1.0]
    row.extend(xn)
    row.extend(xn[j] ** 2 for j in range(k))
    if k <= 6:
        for a in range(k):
            for b in range(a + 1, k):
                row.append(xn[a] * xn[b])

    m = len(model.coefficients)
    return sum(model.coefficients[a] * row[a] for a in range(min(m, len(row))))


def _solve_linear_system(A: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting."""
    n = len(b)
    # Augmented matrix [A|b]
    M = [A[i][:] + [b[i]] for i in range(n)]

    for col in range(n):
        # Partial pivot
        max_row = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[max_row] = M[max_row], M[col]

        pivot = M[col][col]
        if abs(pivot) < 1e-12:
            continue

        for row in range(col + 1, n):
            factor = M[row][col] / pivot
            for j in range(col, n + 1):
                M[row][j] -= factor * M[col][j]

    # Back substitution
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        if abs(M[i][i]) < 1e-12:
            x[i] = 0.0
        else:
            x[i] = (
                M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))
            ) / M[i][i]

    return x
