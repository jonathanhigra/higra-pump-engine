"""Análise de pulsações de pressão — FFT + identificação BPF — Fase 19.2.

Lê as séries temporais de probes do OpenFOAM (``postProcessing/probes/``)
e calcula:
  - FFT com janelamento Hanning
  - Picos em BPF, 2×BPF, 3×BPF, RSI harmonics
  - Nível RMS por probe
  - Identificação automática do maior contribuinte

Referências:
    - Arndt, R.E.A. (1993). "Pressure fluctuations in centrifugal pumps"
    - Gülich, J.F. (2014). Centrifugal Pumps, Ch. 10

Usage
-----
    from hpe.cfd.postprocessing.pulsations import analyze_probes

    result = analyze_probes(
        case_dir=Path("cfd_transient"),
        rpm=1750, blade_count=6,
    )
    print(result.dominant_frequency, result.bpf_amplitude)
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
class ProbeSpectrum:
    """Espectro de um único probe."""
    probe_id: int
    location: tuple[float, float, float]
    frequencies: list[float]
    amplitudes: list[float]
    rms: float
    bpf_amplitude: float
    bpf_2_amplitude: float
    bpf_3_amplitude: float
    dominant_freq: float
    dominant_amp: float

    def to_dict(self) -> dict:
        return {
            "probe_id": self.probe_id,
            "location": list(self.location),
            "rms": round(self.rms, 2),
            "bpf_amplitude": round(self.bpf_amplitude, 2),
            "bpf_2_amplitude": round(self.bpf_2_amplitude, 2),
            "bpf_3_amplitude": round(self.bpf_3_amplitude, 2),
            "dominant_freq": round(self.dominant_freq, 2),
            "dominant_amp": round(self.dominant_amp, 2),
            "n_bins": len(self.frequencies),
            # Truncate spectrum to first ~200 bins for transport
            "frequencies": [round(f, 2) for f in self.frequencies[:200]],
            "amplitudes":  [round(a, 2) for a in self.amplitudes[:200]],
        }


@dataclass
class PulsationAnalysis:
    """Resultado completo da análise."""
    rpm: float
    blade_count: int
    bpf_hz: float
    n_samples: int
    fs_hz: float
    spectra: list[ProbeSpectrum] = field(default_factory=list)
    dominant_probe: Optional[int] = None
    dominant_frequency: float = 0.0
    bpf_amplitude: float = 0.0
    source: str = "estimated"

    def to_dict(self) -> dict:
        return {
            "rpm": self.rpm,
            "blade_count": self.blade_count,
            "bpf_hz": round(self.bpf_hz, 2),
            "n_samples": self.n_samples,
            "fs_hz": round(self.fs_hz, 2),
            "dominant_probe": self.dominant_probe,
            "dominant_frequency": round(self.dominant_frequency, 2),
            "bpf_amplitude": round(self.bpf_amplitude, 2),
            "source": self.source,
            "spectra": [s.to_dict() for s in self.spectra],
        }


def analyze_probes(
    case_dir: "str | Path",
    rpm: float,
    blade_count: int,
    field_name: str = "p",
) -> PulsationAnalysis:
    """Analisar probes do OpenFOAM e calcular FFT com picos em BPF.

    Parameters
    ----------
    case_dir : Path
        Diretório do caso OpenFOAM.
    rpm : float
        Rotação da bomba [rpm].
    blade_count : int
        Número de pás (para cálculo de BPF).
    field_name : str
        Nome do campo nos probes (p, U, etc.).
    """
    case_dir = Path(case_dir)
    bpf = blade_count * rpm / 60.0
    result = PulsationAnalysis(rpm=rpm, blade_count=blade_count, bpf_hz=bpf, n_samples=0, fs_hz=0)

    probe_file = case_dir / "postProcessing" / "probes" / "0" / field_name
    if not probe_file.exists():
        # Search for any time subdirectory
        probes_root = case_dir / "postProcessing" / "probes"
        if probes_root.exists():
            time_dirs = sorted(probes_root.iterdir())
            for td in time_dirs:
                candidate = td / field_name
                if candidate.exists():
                    probe_file = candidate
                    break

    if probe_file.exists():
        result = _parse_and_fft(probe_file, result)
        result.source = "cfd"
    else:
        # Synthetic spectrum for demo/dry-run
        result = _synthetic_spectrum(result)
        result.source = "estimated"

    return result


# ---------------------------------------------------------------------------
# Parsing + FFT
# ---------------------------------------------------------------------------

def _parse_and_fft(probe_file: Path, result: PulsationAnalysis) -> PulsationAnalysis:
    """Parser do formato OpenFOAM probes + FFT com janelamento Hanning."""
    if not _NP:
        return result

    lines = probe_file.read_text(errors="ignore").splitlines()

    # Header com as coordenadas dos probes
    probe_locs: list[tuple[float, float, float]] = []
    data_lines: list[list[float]] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            # Parsear "# Probe N (x y z)"
            import re
            m = re.search(r"Probe\s+\d+\s*\(([-\d.eE+\s]+)\)", line)
            if m:
                coords = [float(c) for c in m.group(1).split()]
                if len(coords) >= 3:
                    probe_locs.append((coords[0], coords[1], coords[2]))
            continue
        parts = line.split()
        try:
            row = [float(p) for p in parts]
            data_lines.append(row)
        except ValueError:
            continue

    if not data_lines:
        return result

    arr = np.array(data_lines)
    time = arr[:, 0]
    signals = arr[:, 1:]   # colunas 1..n_probes
    n_samples = len(time)

    if n_samples < 16:
        return result

    dt = float(time[1] - time[0]) if n_samples > 1 else 1e-3
    fs = 1.0 / dt if dt > 0 else 0.0
    result.n_samples = n_samples
    result.fs_hz = fs

    # FFT por probe com janela Hanning
    window = np.hanning(n_samples)
    n_probes = signals.shape[1]

    for p_idx in range(n_probes):
        s = signals[:, p_idx] - signals[:, p_idx].mean()
        s_win = s * window
        spec = np.fft.rfft(s_win)
        freqs = np.fft.rfftfreq(n_samples, d=dt)
        amps = np.abs(spec) * 2.0 / (n_samples * window.mean())

        # Picos em BPF, 2×BPF, 3×BPF
        bpf = result.bpf_hz
        bpf1 = _amp_at(freqs, amps, bpf)
        bpf2 = _amp_at(freqs, amps, 2 * bpf)
        bpf3 = _amp_at(freqs, amps, 3 * bpf)

        # Frequência dominante (maior amplitude exceto DC)
        if len(amps) > 1:
            dom_idx = int(np.argmax(amps[1:])) + 1
            dom_f = float(freqs[dom_idx])
            dom_a = float(amps[dom_idx])
        else:
            dom_f, dom_a = 0.0, 0.0

        rms = float(np.sqrt(np.mean(s ** 2)))
        loc = probe_locs[p_idx] if p_idx < len(probe_locs) else (0, 0, 0)

        result.spectra.append(ProbeSpectrum(
            probe_id=p_idx,
            location=loc,
            frequencies=freqs.tolist(),
            amplitudes=amps.tolist(),
            rms=rms,
            bpf_amplitude=bpf1,
            bpf_2_amplitude=bpf2,
            bpf_3_amplitude=bpf3,
            dominant_freq=dom_f,
            dominant_amp=dom_a,
        ))

    # Qual probe domina globalmente?
    if result.spectra:
        dom_probe = max(result.spectra, key=lambda s: s.bpf_amplitude)
        result.dominant_probe = dom_probe.probe_id
        result.dominant_frequency = dom_probe.dominant_freq
        result.bpf_amplitude = dom_probe.bpf_amplitude

    return result


def _amp_at(freqs, amps, target: float, tolerance: float = 0.10) -> float:
    """Amplitude no bin mais próximo de ``target`` (± tolerance × target)."""
    if not _NP:
        return 0.0
    if target <= 0:
        return 0.0
    diffs = np.abs(freqs - target)
    idx = int(np.argmin(diffs))
    if float(diffs[idx]) > tolerance * target:
        return 0.0
    return float(amps[idx])


def _synthetic_spectrum(result: PulsationAnalysis) -> PulsationAnalysis:
    """Gerar espectro sintético plausível (BPF dominant)."""
    if not _NP:
        return result

    fs = 10 * result.bpf_hz  # 10× BPF para bom resolvido
    dt = 1.0 / fs
    n = 1024
    time = np.arange(n) * dt

    # Sinal: BPF + 2×BPF (20%) + 3×BPF (8%) + ruído branco
    rng = np.random.default_rng(42)
    sig = (
        1500 * np.sin(2 * math.pi * result.bpf_hz * time)
        + 300 * np.sin(2 * math.pi * 2 * result.bpf_hz * time + 0.5)
        + 120 * np.sin(2 * math.pi * 3 * result.bpf_hz * time + 1.1)
        + 80 * rng.standard_normal(n)
    )

    window = np.hanning(n)
    spec = np.fft.rfft((sig - sig.mean()) * window)
    freqs = np.fft.rfftfreq(n, d=dt)
    amps = np.abs(spec) * 2.0 / (n * window.mean())

    spectrum = ProbeSpectrum(
        probe_id=0,
        location=(0.2, 0.0, 0.0),
        frequencies=freqs.tolist(),
        amplitudes=amps.tolist(),
        rms=float(np.sqrt(np.mean(sig ** 2))),
        bpf_amplitude=_amp_at(freqs, amps, result.bpf_hz),
        bpf_2_amplitude=_amp_at(freqs, amps, 2 * result.bpf_hz),
        bpf_3_amplitude=_amp_at(freqs, amps, 3 * result.bpf_hz),
        dominant_freq=result.bpf_hz,
        dominant_amp=1500.0,
    )
    result.spectra.append(spectrum)
    result.n_samples = n
    result.fs_hz = fs
    result.dominant_probe = 0
    result.dominant_frequency = result.bpf_hz
    result.bpf_amplitude = spectrum.bpf_amplitude

    return result
