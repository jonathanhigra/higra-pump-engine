"""Forças radiais não-balanceadas no eixo — Fase 19.3.

Lê a saída do function object ``forces`` do OpenFOAM e calcula:
  - Força radial magnitude |F_r|
  - Ângulo de ação (relativo à voluta tongue)
  - Coeficiente de força radial Kr (adimensional Stepanoff)
  - Evolução temporal e FFT da força radial para identificar BPF

Referências:
    - Stepanoff, A.J. (1957). Centrifugal and Axial Flow Pumps.
    - Gülich, J.F. (2014). Centrifugal Pumps, Ch. 9 §9.3.6.

Fórmula do coeficiente de força radial (Stepanoff):

    Kr = F_r / (ρ · g · H · D₂ · b₂)

Típico Kr para bomba centrífuga simples:
  - BEP: 0.05 - 0.10
  - Off-BEP: 0.15 - 0.30
  - Shut-off: 0.30 - 0.50  (máximo perigoso para rolamentos)

Usage
-----
    from hpe.cfd.postprocessing.radial_forces import analyze_radial_forces

    result = analyze_radial_forces(case_dir, sizing)
    print(result.mean_kr, result.max_force_N)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

try:
    import numpy as np
    _NP = True
except ImportError:
    _NP = False
    np = None  # type: ignore


@dataclass
class RadialForceSample:
    """Amostra única de força radial no tempo t."""
    time: float
    fx: float
    fy: float
    fz: float
    f_radial: float     # sqrt(fx² + fy²)
    angle_deg: float    # atan2(fy, fx) em graus
    kr: float           # coeficiente normalizado

    def to_dict(self) -> dict:
        return {
            "t": round(self.time, 5),
            "fx": round(self.fx, 2),
            "fy": round(self.fy, 2),
            "fz": round(self.fz, 2),
            "f_radial": round(self.f_radial, 2),
            "angle_deg": round(self.angle_deg, 1),
            "kr": round(self.kr, 4),
        }


@dataclass
class RadialForceAnalysis:
    """Análise completa das forças radiais."""
    samples: list[RadialForceSample] = field(default_factory=list)
    mean_force_N: float = 0.0
    max_force_N: float = 0.0
    rms_force_N: float = 0.0
    mean_kr: float = 0.0
    max_kr: float = 0.0
    dominant_angle_deg: float = 0.0

    # FFT da força radial
    bpf_hz: float = 0.0
    bpf_amplitude_N: float = 0.0
    dominant_frequency_hz: float = 0.0

    # Safety flags
    risk_level: str = "safe"    # safe | marginal | risky | critical
    source: str = "estimated"

    def to_dict(self) -> dict:
        return {
            "n_samples": len(self.samples),
            "mean_force_N": round(self.mean_force_N, 2),
            "max_force_N": round(self.max_force_N, 2),
            "rms_force_N": round(self.rms_force_N, 2),
            "mean_kr": round(self.mean_kr, 4),
            "max_kr": round(self.max_kr, 4),
            "dominant_angle_deg": round(self.dominant_angle_deg, 1),
            "bpf_hz": round(self.bpf_hz, 2),
            "bpf_amplitude_N": round(self.bpf_amplitude_N, 2),
            "dominant_frequency_hz": round(self.dominant_frequency_hz, 2),
            "risk_level": self.risk_level,
            "source": self.source,
            # Truncate time series for transport
            "samples": [s.to_dict() for s in self.samples[:500]],
        }


def analyze_radial_forces(
    case_dir: "str | Path",
    sizing,
    fluid_density: float = 998.2,
) -> RadialForceAnalysis:
    """Ler forces.dat e analisar forças radiais no eixo.

    Parameters
    ----------
    case_dir : Path
        Diretório do caso OpenFOAM.
    sizing : SizingResult
        Dimensionamento (para normalização Kr).
    fluid_density : float
        Densidade do fluido [kg/m³].
    """
    case_dir = Path(case_dir)
    result = RadialForceAnalysis()

    D2 = float(getattr(sizing, "impeller_d2", getattr(sizing, "d2", 0.30)))
    b2 = float(getattr(sizing, "impeller_b2", getattr(sizing, "b2", 0.02)))
    H = float(getattr(sizing, "H", 30.0))
    rpm = float(getattr(sizing, "n", 1750))
    blade_count = int(getattr(sizing, "blade_count", 6))

    result.bpf_hz = blade_count * rpm / 60.0
    kr_denom = fluid_density * 9.81 * H * D2 * b2

    # Localizar arquivo de forças do OpenFOAM
    forces_file = _find_forces_file(case_dir)
    if forces_file is not None:
        try:
            _parse_forces_file(forces_file, result, kr_denom)
            result.source = "cfd"
        except Exception as exc:
            log.warning("forces parse failed: %s", exc)
            result = _synthetic_forces(result, kr_denom)
    else:
        result = _synthetic_forces(result, kr_denom)

    _compute_statistics(result, kr_denom)
    _compute_fft(result)
    _assess_risk(result)

    return result


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def _find_forces_file(case_dir: Path) -> Optional[Path]:
    """Localizar arquivo forces.dat do OpenFOAM."""
    candidates = [
        case_dir / "postProcessing" / "forces" / "0" / "forces.dat",
    ]
    for c in candidates:
        if c.exists():
            return c

    # Search recursive
    forces_root = case_dir / "postProcessing" / "forces"
    if forces_root.exists():
        for f in forces_root.rglob("forces.dat"):
            return f
        for f in forces_root.rglob("force.dat"):
            return f
    return None


def _parse_forces_file(file: Path, result: RadialForceAnalysis, kr_denom: float) -> None:
    """Parser do formato forces.dat do OpenFOAM.

    Formato típico::
        # Time Fx(press) Fy(press) Fz(press) Fx(visc) Fy(visc) Fz(visc) ...
        0.001 1234.5 -456.7 12.3 45.6 -12.3 4.5 ...
    """
    lines = file.read_text(errors="ignore").splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.replace("(", " ").replace(")", " ").split()
        try:
            nums = [float(p) for p in parts]
        except ValueError:
            continue

        if len(nums) < 7:
            continue

        t = nums[0]
        # Pressão + viscoso
        fx_p, fy_p, fz_p = nums[1], nums[2], nums[3]
        fx_v = nums[4] if len(nums) > 4 else 0
        fy_v = nums[5] if len(nums) > 5 else 0
        fz_v = nums[6] if len(nums) > 6 else 0

        fx = fx_p + fx_v
        fy = fy_p + fy_v
        fz = fz_p + fz_v
        f_rad = math.hypot(fx, fy)
        angle = math.degrees(math.atan2(fy, fx))
        kr = f_rad / kr_denom if kr_denom > 0 else 0.0

        result.samples.append(RadialForceSample(
            time=t, fx=fx, fy=fy, fz=fz,
            f_radial=f_rad, angle_deg=angle, kr=kr,
        ))


def _synthetic_forces(result: RadialForceAnalysis, kr_denom: float) -> RadialForceAnalysis:
    """Série sintética plausível: componente DC + oscilação BPF."""
    if not _NP:
        return result

    n = 256
    t_end = 10.0 / max(1.0, result.bpf_hz)  # 10 períodos de BPF
    t_arr = np.linspace(0, t_end, n)

    f0_rad = 800.0          # força radial média [N]
    angle0 = math.radians(210)   # típico: oposto à voluta tongue

    # DC + BPF oscilation
    fx_dc = f0_rad * math.cos(angle0)
    fy_dc = f0_rad * math.sin(angle0)

    amp_x = 300.0
    amp_y = 200.0
    rng = np.random.default_rng(123)

    for i, t in enumerate(t_arr):
        fx = fx_dc + amp_x * math.sin(2 * math.pi * result.bpf_hz * t) + rng.standard_normal() * 40
        fy = fy_dc + amp_y * math.cos(2 * math.pi * result.bpf_hz * t + 0.3) + rng.standard_normal() * 40
        fz = rng.standard_normal() * 20
        f_rad = math.hypot(fx, fy)
        angle = math.degrees(math.atan2(fy, fx))
        kr = f_rad / kr_denom if kr_denom > 0 else 0.0
        result.samples.append(RadialForceSample(
            time=float(t), fx=fx, fy=fy, fz=fz,
            f_radial=f_rad, angle_deg=angle, kr=kr,
        ))
    return result


# ---------------------------------------------------------------------------
# Statistics, FFT, risk
# ---------------------------------------------------------------------------

def _compute_statistics(result: RadialForceAnalysis, kr_denom: float) -> None:
    if not result.samples:
        return

    fr = [s.f_radial for s in result.samples]
    angles = [s.angle_deg for s in result.samples]
    krs = [s.kr for s in result.samples]

    result.mean_force_N = sum(fr) / len(fr)
    result.max_force_N = max(fr)
    result.rms_force_N = math.sqrt(sum(f * f for f in fr) / len(fr))
    result.mean_kr = sum(krs) / len(krs)
    result.max_kr = max(krs)

    # Ângulo "dominante" = atan2(média Fy, média Fx) — não apenas média de ângulos
    mean_fx = sum(s.fx for s in result.samples) / len(result.samples)
    mean_fy = sum(s.fy for s in result.samples) / len(result.samples)
    result.dominant_angle_deg = math.degrees(math.atan2(mean_fy, mean_fx))


def _compute_fft(result: RadialForceAnalysis) -> None:
    """FFT da magnitude f_radial para identificar picos em BPF."""
    if not _NP or len(result.samples) < 16:
        return

    times = np.array([s.time for s in result.samples])
    fr = np.array([s.f_radial for s in result.samples])

    if len(times) < 2:
        return
    dt = float(np.diff(times).mean())
    if dt <= 0:
        return

    n = len(fr)
    window = np.hanning(n)
    sig = (fr - fr.mean()) * window
    spec = np.fft.rfft(sig)
    freqs = np.fft.rfftfreq(n, d=dt)
    amps = np.abs(spec) * 2.0 / (n * window.mean())

    # Amplitude em BPF
    if result.bpf_hz > 0:
        idx = int(np.argmin(np.abs(freqs - result.bpf_hz)))
        if idx < len(amps):
            result.bpf_amplitude_N = float(amps[idx])

    # Frequência dominante (exceto DC)
    if len(amps) > 1:
        dom_idx = int(np.argmax(amps[1:])) + 1
        result.dominant_frequency_hz = float(freqs[dom_idx])


def _assess_risk(result: RadialForceAnalysis) -> None:
    """Classificar risco baseado em Kr máximo (Stepanoff/Gülich)."""
    kr = result.max_kr
    if kr < 0.12:
        result.risk_level = "safe"
    elif kr < 0.20:
        result.risk_level = "marginal"
    elif kr < 0.35:
        result.risk_level = "risky"
    else:
        result.risk_level = "critical"
