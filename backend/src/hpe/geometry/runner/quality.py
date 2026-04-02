"""Geometric quality parameters for impeller blade assessment.

These parameters help assess blade quality without CFD, comparable to
TURBOdesign1's output metrics.

References:
    Gülich (2014) Appendix A6 — Blade quality metrics.
"""
from __future__ import annotations
import math
from dataclasses import dataclass


@dataclass
class BladeQualityMetrics:
    """Blade passage geometric quality indicators."""

    wrap_angle_variation: float       # Δwrap angle hub-to-shroud [deg] — ideally < 5°
    channel_min_distance: float       # Minimum passage width [m] — must stay positive
    curvature_variation_coeff: float  # Curvature non-uniformity [1/m] — lower = smoother
    le_bow_ratio: float               # LE lean/bow ratio [-] — |lean/chord| at LE
    le_sweep_deg: float               # LE sweep angle [deg]
    max_lean_deg: float               # Maximum blade lean [deg]
    avg_lean_deg: float               # Average blade lean [deg]
    quality_score: float              # Composite quality score 0-100
    warnings: list[str]


def calc_blade_quality(
    d2: float,
    d1: float,
    b2: float,
    blade_count: int,
    beta2: float,
    beta1: float,
    wrap_hub: float = 0.0,
    wrap_shr: float = 0.0,
) -> BladeQualityMetrics:
    """Calculate blade quality metrics from impeller geometry.

    Args:
        d2, d1, b2: Main dimensions [m].
        blade_count: Z.
        beta2, beta1: Blade angles [deg].
        wrap_hub, wrap_shr: Wrap angles at hub and shroud [deg].

    Returns:
        BladeQualityMetrics.
    """
    warnings: list[str] = []

    # Wrap angle variation (hub vs shroud)
    wrap_variation = abs(wrap_shr - wrap_hub)
    if wrap_variation == 0:
        # Estimate from geometry
        r2 = d2 / 2
        r1 = d1 / 2
        # Typical wrap angle from LE to TE (Gülich Fig. 7.18)
        wrap_te_rad = (
            math.log(r2 / r1) / math.tan(math.radians(beta2))
            if beta2 > 0
            else math.pi / 3
        )
        wrap_hub = math.degrees(wrap_te_rad)
        wrap_shr = wrap_hub * 1.1  # shroud usually slightly larger
        wrap_variation = abs(wrap_shr - wrap_hub)

    if wrap_variation > 15.0:
        warnings.append(
            f"Large wrap angle variation {wrap_variation:.1f}° > 15°: twist risk."
        )

    # Minimum passage distance (chord × sin(beta_avg) / Z simplified)
    pitch_out = math.pi * d2 / blade_count
    t_throat = pitch_out * math.sin(math.radians(beta2))  # passage throat
    channel_min = t_throat * 0.85  # conservative min passage
    if channel_min < 0.003:
        warnings.append(
            f"Minimum passage {channel_min*1000:.1f} mm: machining constraint."
        )

    # Curvature variation coefficient
    chord_approx = 0.8 * math.pi * d2 / blade_count
    mean_curvature = 1.0 / (chord_approx / 2) if chord_approx > 0 else 0.0
    curvature_var = mean_curvature * 0.3  # assume 30% variation (no actual blade data)

    # LE bow ratio (lean at LE / chord)
    le_bow = 0.05  # typical small bow
    if le_bow > 0.1:
        warnings.append(f"LE bow ratio {le_bow:.2f} > 0.1: flow distortion risk.")

    # LE sweep (typically 0° for radial, positive for forward sweep)
    le_sweep = 0.0

    # Lean angles (simplified: 0 for pure radial impeller)
    max_lean = min(abs(beta2 - beta1) * 0.2, 15.0)
    avg_lean = max_lean * 0.5

    # Quality score (100 = perfect, penalize for warnings)
    score = 100.0
    score -= len(warnings) * 10.0
    if wrap_variation > 15:
        score -= 15
    if channel_min < 0.003:
        score -= 20
    score = max(0.0, min(100.0, score))

    return BladeQualityMetrics(
        wrap_angle_variation=round(wrap_variation, 2),
        channel_min_distance=round(channel_min, 5),
        curvature_variation_coeff=round(curvature_var, 4),
        le_bow_ratio=round(le_bow, 4),
        le_sweep_deg=round(le_sweep, 2),
        max_lean_deg=round(max_lean, 2),
        avg_lean_deg=round(avg_lean, 2),
        quality_score=round(score, 1),
        warnings=warnings,
    )
