"""Spanwise blade loading — Cp em múltiplos spans (hub/mid/tip) — Fase 17.4.

Estende ``blade_loading.py`` com extração em múltiplas posições spanwise
(hub, mid, tip) — equivalente à aba "Blade-to-Blade" do CFX-Post.

Permite identificar:
  - Tip clearance losses (Cp degradado no tip)
  - Incidência não-uniforme em altura
  - Separação em span específica

Usage
-----
    from hpe.cfd.results.spanwise_loading import extract_spanwise_loading

    result = extract_spanwise_loading(
        case_dir=Path("cfd_run"),
        op=op,
        spans=[0.1, 0.5, 0.9],  # hub, mid, tip (normalizado 0-1)
    )
    for span, loading in result.by_span.items():
        print(f"span={span}: loading_peak={loading.loading_peak}")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


@dataclass
class SpanLoadingPoint:
    """Loading em um único span."""
    span: float                     # Posição normalizada 0=hub, 1=tip
    xi: list[float]                 # Coord na corda [0, 1]
    cp_ps: list[float]              # Pressure-side Cp
    cp_ss: list[float]              # Suction-side Cp
    delta_cp: list[float]           # ΔCp = Cp_ps − Cp_ss
    loading_peak: float             # max(ΔCp)
    loading_peak_xi: float          # posição do peak
    loading_integral: float         # ∫ΔCp dxi
    separation_risk: bool
    separation_xi: Optional[float]  # posição da separação (se houver)

    def to_dict(self) -> dict:
        return {
            "span": round(self.span, 3),
            "xi": [round(x, 3) for x in self.xi],
            "cp_ps": [round(v, 3) for v in self.cp_ps],
            "cp_ss": [round(v, 3) for v in self.cp_ss],
            "delta_cp": [round(v, 3) for v in self.delta_cp],
            "loading_peak": round(self.loading_peak, 3),
            "loading_peak_xi": round(self.loading_peak_xi, 3),
            "loading_integral": round(self.loading_integral, 3),
            "separation_risk": self.separation_risk,
            "separation_xi": round(self.separation_xi, 3) if self.separation_xi else None,
        }


@dataclass
class SpanwiseLoadingResult:
    """Conjunto de loadings ao longo do span."""
    by_span: dict[float, SpanLoadingPoint] = field(default_factory=dict)
    n_chord: int = 21
    source: str = "estimated"

    def span_indices(self) -> list[float]:
        return sorted(self.by_span.keys())

    def tip_clearance_indicator(self) -> float:
        """Queda no loading do mid→tip como % → indica tip losses.

        Se loading_peak(tip) / loading_peak(mid) < 0.7, provável
        impacto de tip clearance significativo.
        """
        spans = self.span_indices()
        if len(spans) < 2:
            return 1.0
        mid = self.by_span[spans[len(spans) // 2]]
        tip = self.by_span[spans[-1]]
        if mid.loading_peak > 0:
            return tip.loading_peak / mid.loading_peak
        return 1.0

    def to_dict(self) -> dict:
        return {
            "n_chord": self.n_chord,
            "source": self.source,
            "tip_clearance_indicator": round(self.tip_clearance_indicator(), 3),
            "by_span": {str(round(s, 3)): pt.to_dict() for s, pt in self.by_span.items()},
        }


def extract_spanwise_loading(
    case_dir: "str | Path",
    op,
    spans: Optional[list[float]] = None,
    n_chord: int = 21,
) -> SpanwiseLoadingResult:
    """Extrair carregamento em múltiplas posições spanwise.

    Parameters
    ----------
    case_dir : Path
        Diretório do caso CFD.
    op : OperatingPoint
        Ponto de operação (para normalização de Cp).
    spans : list[float] | None
        Spans normalizados [0, 1].  Default: [0.1, 0.5, 0.9].
    n_chord : int
        Número de pontos ao longo da corda.

    Returns
    -------
    SpanwiseLoadingResult
        Loading em cada span solicitado.
    """
    if spans is None:
        spans = [0.1, 0.5, 0.9]

    case_dir = Path(case_dir)
    result = SpanwiseLoadingResult(n_chord=n_chord, source="estimated")

    # Tentar extrair de arquivo CFD se existir; senão, estimar
    cfd_file = case_dir / "postProcessing" / "bladePressureSpanwise" / "0" / "bladeLoadingSpanwise.csv"
    if cfd_file.exists():
        try:
            result = _parse_cfd_spanwise(cfd_file, spans)
            result.source = "cfd"
            return result
        except Exception as exc:
            log.warning("Failed to parse CFD spanwise file: %s", exc)

    # Fallback: estimativa analítica por span
    for span in spans:
        result.by_span[span] = _estimate_loading_at_span(op, span, n_chord)

    return result


# ---------------------------------------------------------------------------
# Estimation (fallback sem CFD)
# ---------------------------------------------------------------------------

def _estimate_loading_at_span(op, span: float, n_chord: int) -> SpanLoadingPoint:
    """Estimativa analítica do loading em um span.

    Usa um perfil de thin-airfoil com:
      - Incidência aumentada no tip (tip vortex)
      - Tip clearance loss: ΔCp decresce para span → 1
      - Suction-side separation mais provável no hub (low-Re)
    """
    import math
    xi = [i / (n_chord - 1) for i in range(n_chord)]

    # ΔCp peak decresce linearmente do mid para o tip (20% loss no tip)
    tip_factor = 1.0 - 0.20 * max(0, span - 0.5) * 2
    hub_factor = 1.0 - 0.10 * max(0, 0.3 - span) / 0.3

    peak_value = 1.4 * tip_factor * hub_factor

    # Distribuição sinusoidal: ΔCp = peak × sin(π × xi)
    delta_cp = [peak_value * math.sin(math.pi * x) for x in xi]

    # Pressure side: base Cp
    cp_ps = [0.3 - 0.4 * math.sin(math.pi * x) for x in xi]
    # Suction side: cp_ps − delta_cp
    cp_ss = [ps - d for ps, d in zip(cp_ps, delta_cp)]

    peak = max(delta_cp)
    peak_xi = xi[delta_cp.index(peak)]
    integral = sum(d * (1 / (n_chord - 1)) for d in delta_cp)

    # Separação: gradiente adverso muito forte na SS ao final (xi > 0.7)
    sep_risk = False
    sep_xi = None
    for i in range(int(n_chord * 0.7), n_chord - 1):
        grad = (cp_ss[i + 1] - cp_ss[i]) * (n_chord - 1)
        if grad > 0.8:  # recuperação rápida → separação provável
            sep_risk = True
            sep_xi = xi[i]
            break

    # Hub normalmente tem mais risco (Re menor)
    if span < 0.3:
        sep_risk = sep_risk or (peak_value > 1.2)
        if sep_risk and sep_xi is None:
            sep_xi = 0.75

    return SpanLoadingPoint(
        span=span, xi=xi, cp_ps=cp_ps, cp_ss=cp_ss, delta_cp=delta_cp,
        loading_peak=peak, loading_peak_xi=peak_xi,
        loading_integral=integral, separation_risk=sep_risk, separation_xi=sep_xi,
    )


def _parse_cfd_spanwise(file: Path, spans: list[float]) -> SpanwiseLoadingResult:
    """Parse CSV de loading spanwise do CFD (formato esperado)."""
    result = SpanwiseLoadingResult(source="cfd")
    # Expected CSV columns: span, xi, cp_ps, cp_ss
    rows = file.read_text().splitlines()
    data_by_span: dict[float, list[tuple[float, float, float]]] = {}
    for line in rows[1:]:  # skip header
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 4:
            continue
        try:
            s, x, cps, css = float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])
            # Match to nearest requested span
            nearest = min(spans, key=lambda t: abs(t - s))
            if abs(nearest - s) < 0.05:
                data_by_span.setdefault(nearest, []).append((x, cps, css))
        except ValueError:
            continue

    for s, pts in data_by_span.items():
        pts.sort()
        xi = [p[0] for p in pts]
        cp_ps = [p[1] for p in pts]
        cp_ss = [p[2] for p in pts]
        delta = [a - b for a, b in zip(cp_ps, cp_ss)]
        peak = max(delta) if delta else 0.0
        peak_xi = xi[delta.index(peak)] if delta else 0.5
        integral = sum(d * (1 / max(1, len(xi) - 1)) for d in delta)
        result.by_span[s] = SpanLoadingPoint(
            span=s, xi=xi, cp_ps=cp_ps, cp_ss=cp_ss, delta_cp=delta,
            loading_peak=peak, loading_peak_xi=peak_xi,
            loading_integral=integral, separation_risk=False, separation_xi=None,
        )
    return result
