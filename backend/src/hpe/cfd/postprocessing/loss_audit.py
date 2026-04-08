"""Loss audit baseado em geração de entropia — Fase 18.3.

Decompõe as perdas hidráulicas totais por zona física integrando a taxa
de geração de entropia (Kock & Herwig 2004) em cada região.

Zonas:
  - Profile (pás — perdas de perfil laminar/turbulento)
  - Secondary (hub/shroud — vortices secundários + passage vortex)
  - Tip (gap do tip — tip clearance leakage)
  - Volute (estacionária — perdas de match + difusor + throat)
  - Inlet/outlet (interfaces — mixing losses)

Referências:
    - Kock, F. & Herwig, H. (2004). "Local entropy production in
      turbulent shear flows: a high-Reynolds number model with wall
      functions." Int. J. Heat Mass Transfer 47, 2205-2215.
    - Denton, J.D. (1993). "Loss mechanisms in turbomachines"
      IGTI Scholar Lecture.

Usage
-----
    from hpe.cfd.postprocessing.loss_audit import audit_losses_from_cfd

    audit = audit_losses_from_cfd(case_dir, sizing)
    print(audit.total_loss_kW, audit.zones["profile"])
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


@dataclass
class ZoneLoss:
    """Perda integrada em uma zona específica."""
    name: str
    entropy_rate_W_per_K: float     # ∫ S_gen dV [W/K]
    loss_power_W: float             # T × S_gen [W]
    loss_head_m: float              # loss_power / (ρ g Q)
    fraction_of_total: float        # fração sobre a perda total

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "entropy_rate_W_per_K": round(self.entropy_rate_W_per_K, 4),
            "loss_power_W": round(self.loss_power_W, 2),
            "loss_head_m": round(self.loss_head_m, 4),
            "fraction_of_total": round(self.fraction_of_total, 4),
        }


@dataclass
class LossAuditResult:
    """Resultado completo da auditoria de perdas."""
    total_loss_power_W: float
    total_loss_head_m: float
    zones: dict[str, ZoneLoss] = field(default_factory=dict)
    efficiency_impact: float = 0.0  # %
    source: str = "estimated"       # 'cfd' | 'estimated'
    T_ref: float = 293.15

    def to_dict(self) -> dict:
        return {
            "total_loss_power_W": round(self.total_loss_power_W, 2),
            "total_loss_head_m": round(self.total_loss_head_m, 4),
            "efficiency_impact_pct": round(self.efficiency_impact, 2),
            "source": self.source,
            "T_ref_K": self.T_ref,
            "zones": {k: v.to_dict() for k, v in self.zones.items()},
        }

    def largest_zone(self) -> Optional[str]:
        if not self.zones:
            return None
        return max(self.zones.items(), key=lambda kv: kv[1].loss_power_W)[0]


def audit_losses_from_cfd(
    case_dir: "str | Path",
    sizing,
    fluid_density: float = 998.2,
    fluid_temp_K: float = 293.15,
    mu: float = 1e-3,
) -> LossAuditResult:
    """Auditoria de perdas a partir de campo CFD.

    Se o caso possui os campos U, T (ou fallback), integra entropy
    generation por zona.  Senão, gera estimativa via meanline Gülich.
    """
    case_dir = Path(case_dir)
    Q = float(getattr(sizing, "Q", 0.05))
    H = float(getattr(sizing, "H", 30.0))
    eta = float(getattr(sizing, "estimated_efficiency", 0.80))

    # Total de perda hidráulica estimada por eficiência
    useful_power = fluid_density * 9.81 * Q * H
    total_loss_W = useful_power * (1 - eta) / eta if eta > 0 else useful_power * 0.25
    total_loss_m = total_loss_W / (fluid_density * 9.81 * Q) if Q > 0 else 0.0

    # Tentar campo CFD (Fase 18.1 export JSON)
    json_file = case_dir / "field_export.json"
    if json_file.exists():
        try:
            result = _audit_from_field(case_dir, json_file, total_loss_W, fluid_temp_K, mu)
            if result is not None:
                return result
        except Exception as exc:
            log.warning("loss audit from field failed: %s", exc)

    # Fallback: Denton loss breakdown típico para bomba centrífuga
    zones_typical = {
        "profile":   0.30,  # 30% — pás
        "secondary": 0.25,  # 25% — passage + hub vortex
        "tip":       0.15,  # 15% — tip clearance
        "volute":    0.20,  # 20% — voluta (match + throat)
        "inlet":     0.05,  # 5% — incidência
        "outlet":    0.05,  # 5% — mixing saída
    }

    result = LossAuditResult(
        total_loss_power_W=total_loss_W,
        total_loss_head_m=total_loss_m,
        efficiency_impact=(1 - eta) * 100,
        source="estimated",
        T_ref=fluid_temp_K,
    )

    for name, frac in zones_typical.items():
        power = total_loss_W * frac
        head = power / (fluid_density * 9.81 * Q) if Q > 0 else 0.0
        result.zones[name] = ZoneLoss(
            name=name,
            entropy_rate_W_per_K=power / fluid_temp_K,
            loss_power_W=power,
            loss_head_m=head,
            fraction_of_total=frac,
        )

    return result


def _audit_from_field(
    case_dir: Path, json_file: Path, total_loss_W: float,
    T_ref: float, mu: float,
) -> Optional[LossAuditResult]:
    """Integrar entropy generation a partir do grid sampled.

    S_gen = (μ/T) × (∂U_i/∂x_j)²   (irreversibilidades viscosas)
    Ignoramos termos térmicos (escoamento isotérmico incompressível).
    """
    import json
    try:
        import numpy as np
    except ImportError:
        return None

    data = json.loads(json_file.read_text())
    grid = tuple(data.get("grid", [1, 1, 1]))
    nx, ny, nz = grid

    U_mag = np.array(data["fields"].get("U", []))
    if U_mag.size != nx * ny * nz:
        return None

    bb = data.get("bounding_box", {})
    x_min, y_min, z_min = bb.get("min", [0, 0, 0])
    x_max, y_max, z_max = bb.get("max", [1, 1, 1])
    dx = (x_max - x_min) / max(1, nx - 1)
    dy = (y_max - y_min) / max(1, ny - 1)
    dz = (z_max - z_min) / max(1, nz - 1)

    U = U_mag.reshape((nz, ny, nx))
    gz, gy, gx = np.gradient(U, dz, dy, dx)
    grad_sq = gx ** 2 + gy ** 2 + gz ** 2       # Frobenius² do proxy

    # Entropy generation rate por célula [W/(K·m³)]
    s_gen = (mu / T_ref) * grad_sq

    # Volume da célula
    dV = dx * dy * dz

    # Dividir domínio em zonas por região geométrica do grid
    # (aproximação: hub = zonas baixas em z, tip = altas, profile = centro radial)
    r = np.zeros_like(U)
    xv = np.linspace(x_min, x_max, nx)
    yv = np.linspace(y_min, y_max, ny)
    zv = np.linspace(z_min, z_max, nz)
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                r[k, j, i] = math.hypot(xv[i], yv[j])

    r_max = float(r.max())
    z_max_val = float(zv.max())
    z_min_val = float(zv.min())

    mask_tip     = (zv[:, None, None] > 0.9 * z_max_val) | (zv[:, None, None] < 0.9 * z_min_val)
    mask_tip     = np.broadcast_to(mask_tip, U.shape)
    mask_hub     = (zv[:, None, None] < -0.8 * abs(z_min_val)) & ~mask_tip
    mask_profile = (r > 0.4 * r_max) & (r < 0.85 * r_max) & ~mask_tip
    mask_inlet   = (r < 0.3 * r_max)
    mask_outlet  = (r > 0.95 * r_max)
    mask_volute  = ~(mask_tip | mask_hub | mask_profile | mask_inlet | mask_outlet)

    # Integrar entropy rate por zona
    zones_integrals = {
        "profile":   float((s_gen * mask_profile).sum() * dV),
        "secondary": float((s_gen * mask_hub).sum() * dV),
        "tip":       float((s_gen * mask_tip).sum() * dV),
        "volute":    float((s_gen * mask_volute).sum() * dV),
        "inlet":     float((s_gen * mask_inlet).sum() * dV),
        "outlet":    float((s_gen * mask_outlet).sum() * dV),
    }

    total_integral = sum(zones_integrals.values())
    if total_integral <= 0:
        return None

    # Normalizar pelo total de perda conhecido
    result = LossAuditResult(
        total_loss_power_W=total_loss_W,
        total_loss_head_m=0.0,
        source="cfd",
        T_ref=T_ref,
    )

    for name, s_int in zones_integrals.items():
        frac = s_int / total_integral
        power = total_loss_W * frac
        result.zones[name] = ZoneLoss(
            name=name,
            entropy_rate_W_per_K=s_int,
            loss_power_W=power,
            loss_head_m=0.0,
            fraction_of_total=frac,
        )

    return result
