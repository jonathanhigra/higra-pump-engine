"""Extração e normalização de sensibilidades SU2 — Fase 14.

Parseia o arquivo ``surface_sens.csv`` gerado pelo SU2 adjoint e converte
as sensibilidades de superfície em gradientes normalizados de variáveis de
projeto (β₁, β₂, D₂, b₂) para uso no loop de otimização.

Usage
-----
    from hpe.cfd.su2.sensitivity import extract_sensitivities, DesignSensitivities

    sens = extract_sensitivities("./su2/surface_sens.csv", sizing_result)
    print(sens.dbeta2_dJ)   # dJ/dβ₂ normalizado
    print(sens.dD2_dJ)      # dJ/dD₂ normalizado
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class SurfaceSensitivity:
    """Sensibilidade de superfície ponto-a-ponto.

    Attributes
    ----------
    x, y, z : np.ndarray
        Coordenadas dos pontos de superfície.
    sens_x, sens_y, sens_z : np.ndarray
        Componentes do vetor sensibilidade dJ/d(normal).
    sens_magnitude : np.ndarray
        Magnitude |dJ/dn|.
    patch_names : list[str]
        Nomes das patches (blade, hub, shroud, ...).
    """
    x: "np.ndarray"
    y: "np.ndarray"
    z: "np.ndarray"
    sens_x: "np.ndarray"
    sens_y: "np.ndarray"
    sens_z: "np.ndarray"
    sens_magnitude: "np.ndarray"
    patch_names: list[str] = field(default_factory=list)


@dataclass
class DesignSensitivities:
    """Sensibilidades normalizadas das variáveis de projeto.

    Todas as sensibilidades são dJ/dX normalizada pelo valor nominal de X,
    tornando-as adimensionais e comparáveis entre si.

    Attributes
    ----------
    dbeta1_dJ : float
        Sensibilidade normalizada ao ângulo de entrada β₁ [1/deg].
    dbeta2_dJ : float
        Sensibilidade normalizada ao ângulo de saída β₂ [1/deg].
    dD2_dJ : float
        Sensibilidade normalizada ao diâmetro de saída D₂ [1/m].
    db2_dJ : float
        Sensibilidade normalizada à largura de saída b₂ [1/m].
    dD1_dJ : float
        Sensibilidade normalizada ao diâmetro de entrada D₁ [1/m].
    objective : str
        Nome da função objetivo (ex: "total_pressure_loss").
    source : SurfaceSensitivity | None
        Sensibilidades brutas de superfície.
    """

    dbeta1_dJ: float = 0.0
    dbeta2_dJ: float = 0.0
    dD2_dJ: float = 0.0
    db2_dJ: float = 0.0
    dD1_dJ: float = 0.0
    objective: str = "unknown"
    source: Optional[SurfaceSensitivity] = None

    def gradient_vector(self) -> list[float]:
        """Vetor gradiente na ordem [β₁, β₂, D₂, b₂, D₁]."""
        return [self.dbeta1_dJ, self.dbeta2_dJ, self.dD2_dJ, self.db2_dJ, self.dD1_dJ]

    def steepest_descent_step(self, step_size: float = 0.01) -> dict[str, float]:
        """Calcular passo de descida mais íngreme normalizado.

        Retorna delta de cada variável de projeto para reduzir J.
        """
        grad = self.gradient_vector()
        norm = math.sqrt(sum(g * g for g in grad)) or 1.0
        deltas = [-step_size * g / norm for g in grad]
        return {
            "delta_beta1_deg": deltas[0],
            "delta_beta2_deg": deltas[1],
            "delta_D2_m": deltas[2],
            "delta_b2_m": deltas[3],
            "delta_D1_m": deltas[4],
        }

    def to_dict(self) -> dict:
        return {
            "objective": self.objective,
            "dbeta1_dJ": round(self.dbeta1_dJ, 6),
            "dbeta2_dJ": round(self.dbeta2_dJ, 6),
            "dD2_dJ": round(self.dD2_dJ, 6),
            "db2_dJ": round(self.db2_dJ, 6),
            "dD1_dJ": round(self.dD1_dJ, 6),
            "gradient_norm": round(
                math.sqrt(sum(g ** 2 for g in self.gradient_vector())), 6
            ),
        }


# ---------------------------------------------------------------------------
# Funções públicas
# ---------------------------------------------------------------------------

def extract_sensitivities(
    sensitivity_file: "str | Path",
    sizing_result=None,
    objective: str = "total_pressure_loss",
) -> DesignSensitivities:
    """Extrair e normalizar sensibilidades do arquivo SU2.

    Parameters
    ----------
    sensitivity_file : Path
        Caminho para ``surface_sens.csv`` ou ``of_grad.dat``.
    sizing_result : SizingResult | None
        Resultado de sizing para normalização dimensional.
    objective : str
        Nome da função objetivo para metadata.

    Returns
    -------
    DesignSensitivities
        Sensibilidades normalizadas das variáveis de projeto.
    """
    fp = Path(sensitivity_file)

    if not fp.exists():
        log.warning("sensitivity file not found: %s", fp)
        return DesignSensitivities(objective=objective)

    # Detectar formato
    if fp.suffix == ".csv" or fp.name.startswith("surface_sens"):
        surf = _parse_surface_sens_csv(fp)
    else:
        surf = _parse_of_grad(fp)

    if surf is None:
        return DesignSensitivities(objective=objective)

    # Converter sensibilidades de superfície em sensibilidades de variáveis de projeto
    design_sens = _project_to_design_variables(surf, sizing_result)
    design_sens.objective = objective
    design_sens.source = surf
    return design_sens


def extract_from_runner_result(su2_result, sizing_result=None) -> DesignSensitivities:
    """Atalho: extrair sensibilidades diretamente de um SU2Result."""
    if su2_result.sensitivity_file is None:
        return DesignSensitivities(objective="unknown")
    return extract_sensitivities(su2_result.sensitivity_file, sizing_result)


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def _parse_surface_sens_csv(fp: Path) -> Optional[SurfaceSensitivity]:
    """Parsear surface_sens.csv: colunas x, y, z, Sensitivity_x, y, z."""
    try:
        lines = [l for l in fp.read_text().splitlines() if l.strip() and not l.startswith("#")]
        if not lines:
            return None

        # Detectar header
        header = lines[0].lower()
        skip = 1 if any(c in header for c in ["x", "point"]) else 0

        data = []
        for line in lines[skip:]:
            parts = line.split(",")
            if len(parts) >= 6:
                data.append([float(p) for p in parts[:6]])

        if not data:
            return None

        arr = np.array(data)
        sx = arr[:, 3]
        sy = arr[:, 4]
        sz = arr[:, 5]
        return SurfaceSensitivity(
            x=arr[:, 0], y=arr[:, 1], z=arr[:, 2],
            sens_x=sx, sens_y=sy, sens_z=sz,
            sens_magnitude=np.sqrt(sx**2 + sy**2 + sz**2),
        )
    except Exception as exc:
        log.warning("_parse_surface_sens_csv: %s", exc)
        return None


def _parse_of_grad(fp: Path) -> Optional[SurfaceSensitivity]:
    """Parsear of_grad.dat: formato SU2 DV gradient."""
    try:
        lines = [l for l in fp.read_text().splitlines() if l.strip() and not l.startswith("%")]
        if not lines:
            return None

        values = []
        for line in lines:
            parts = line.split()
            if parts:
                try:
                    values.append(float(parts[-1]))
                except ValueError:
                    continue

        # of_grad contém um valor de gradiente por variável de design
        arr = np.array(values)
        n = len(arr)
        x = np.arange(n, dtype=float)
        z = np.zeros(n)
        return SurfaceSensitivity(
            x=x, y=z, z=z,
            sens_x=arr, sens_y=z, sens_z=z,
            sens_magnitude=np.abs(arr),
        )
    except Exception as exc:
        log.warning("_parse_of_grad: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Projeção nas variáveis de projeto
# ---------------------------------------------------------------------------

def _project_to_design_variables(
    surf: SurfaceSensitivity,
    sizing_result=None,
) -> DesignSensitivities:
    """Projetar sensibilidades de superfície em variáveis de projeto.

    Para uma bomba centrífuga as variáveis de projeto são mapeadas
    geometricamente:
      - β₂ : zona de saída do rotor (r > 0.8 × r₂)
      - β₁ : zona de entrada do rotor (r < 0.3 × r₂)
      - D₂ : raio máximo (∂n radial, sentido saída)
      - b₂ : extensão axial na saída
      - D₁ : raio interno na entrada

    Aqui usa-se uma projeção simplificada baseada em coordenadas
    geométricas relativas ao domínio.
    """
    x, y, z = surf.x, surf.y, surf.z
    sx, sy, sz = surf.sens_x, surf.sens_y, surf.sens_z

    # Raio no plano xy (coordenada radial)
    r = np.sqrt(x ** 2 + y ** 2)

    if r.max() < 1e-9:
        return DesignSensitivities()

    r_norm = r / r.max()

    # Projeções por zona radial
    mask_outlet = r_norm > 0.8   # zona de saída → β₂, D₂
    mask_inlet  = r_norm < 0.3   # zona de entrada → β₁, D₁
    mask_mid    = ~mask_outlet & ~mask_inlet  # zona média → b₂

    def mean_sens(mask: "np.ndarray", component: "np.ndarray") -> float:
        vals = component[mask]
        return float(np.mean(vals)) if len(vals) > 0 else 0.0

    # β₂: componente tangencial na saída (sens_y * cos θ - sens_x * sin θ)
    theta_out = np.arctan2(y[mask_outlet], x[mask_outlet]) if mask_outlet.any() else np.array([0.0])
    dbeta2 = float(np.mean(
        sy[mask_outlet] * np.cos(theta_out) - sx[mask_outlet] * np.sin(theta_out)
    )) if mask_outlet.any() else 0.0

    # β₁: componente tangencial na entrada
    theta_in = np.arctan2(y[mask_inlet], x[mask_inlet]) if mask_inlet.any() else np.array([0.0])
    dbeta1 = float(np.mean(
        sy[mask_inlet] * np.cos(theta_in) - sx[mask_inlet] * np.sin(theta_in)
    )) if mask_inlet.any() else 0.0

    # D₂: componente radial na saída (dJ/dr_max)
    dD2 = float(np.mean(
        sx[mask_outlet] * (x[mask_outlet] / (r[mask_outlet] + 1e-9)) +
        sy[mask_outlet] * (y[mask_outlet] / (r[mask_outlet] + 1e-9))
    )) if mask_outlet.any() else 0.0

    # D₁: componente radial na entrada
    dD1 = float(np.mean(
        sx[mask_inlet] * (x[mask_inlet] / (r[mask_inlet] + 1e-9)) +
        sy[mask_inlet] * (y[mask_inlet] / (r[mask_inlet] + 1e-9))
    )) if mask_inlet.any() else 0.0

    # b₂: componente axial (dJ/dz) na zona de saída
    db2 = mean_sens(mask_outlet, sz)

    # Normalização pelo valor nominal das variáveis de projeto
    if sizing_result is not None:
        _d2 = getattr(sizing_result, "d2", 0.3)
        _d1 = getattr(sizing_result, "d1", 0.15)
        _b2 = getattr(sizing_result, "b2", 0.02)
        dD2 *= _d2
        dD1 *= _d1
        db2 *= _b2
        # ângulos: normalizar por 1 rad = 57.3°
        dbeta2 *= 1.0
        dbeta1 *= 1.0

    return DesignSensitivities(
        dbeta1_dJ=dbeta1,
        dbeta2_dJ=dbeta2,
        dD2_dJ=dD2,
        db2_dJ=db2,
        dD1_dJ=dD1,
    )
