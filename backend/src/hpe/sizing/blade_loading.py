"""Blade loading control — rVtheta distribution as design variable.

Provides parameterized blade loading distributions (front/mid/aft/controlled
diffusion) with Bezier S-curve generation, Euler head normalization, and
validation for negative loading, excessive diffusion, and reverse flow risk.

References:
    - Zangeneh, M. (1991). Compressible 3-D inverse design method.
    - Goto & Zangeneh (2002). Pump diffuser inverse design via CFD.
    - Denton, J.D. (1993). Loss mechanisms in turbomachines.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class LoadingTemplate(str, Enum):
    """Predefined loading distribution templates."""

    FRONT_LOADED = "front_loaded"
    MID_LOADED = "mid_loaded"
    AFT_LOADED = "aft_loaded"
    CONTROLLED_DIFFUSION = "controlled_diffusion"
    CUSTOM = "custom"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class LoadingDistribution:
    """2-D blade loading distribution rVtheta(span, chord).

    Attributes:
        streamwise_stations: Normalized chord positions (0 = LE, 1 = TE).
        spanwise_stations: Normalized span positions (0 = hub, 1 = shroud).
        rVtheta: Angular momentum distribution [span][chord] in m^2/s.
    """

    streamwise_stations: np.ndarray  # shape (n_chord,)
    spanwise_stations: np.ndarray    # shape (n_span,)
    rVtheta: np.ndarray              # shape (n_span, n_chord)

    # --- Factory methods ---------------------------------------------------

    @classmethod
    def from_type(
        cls,
        loading_type: LoadingTemplate,
        cu1: float,
        cu2: float,
        r1: float = 0.05,
        r2: float = 0.15,
        n_chord: int = 51,
        n_span: int = 5,
        *,
        inflection: float | None = None,
    ) -> LoadingDistribution:
        """Create a loading distribution from a predefined template.

        Args:
            loading_type: Template to use.
            cu1: Inlet tangential velocity [m/s] (0 for no pre-swirl).
            cu2: Outlet tangential velocity [m/s].
            r1: Inlet radius [m].
            r2: Outlet radius [m].
            n_chord: Number of streamwise stations (20-200).
            n_span: Number of spanwise stations (3-11).
            inflection: Optional inflection point override in [0, 1].

        Returns:
            LoadingDistribution with rVtheta normalized to Euler head.
        """
        n_chord = max(20, min(200, n_chord))
        n_span = max(3, min(11, n_span))

        m = np.linspace(0.0, 1.0, n_chord)
        s = np.linspace(0.0, 1.0, n_span)

        rvt_le = r1 * cu1
        rvt_te = r2 * cu2

        # Determine peak location from template
        if loading_type == LoadingTemplate.FRONT_LOADED:
            peak = inflection if inflection is not None else 0.25
        elif loading_type == LoadingTemplate.MID_LOADED:
            peak = inflection if inflection is not None else 0.45
        elif loading_type == LoadingTemplate.AFT_LOADED:
            peak = inflection if inflection is not None else 0.65
        elif loading_type == LoadingTemplate.CONTROLLED_DIFFUSION:
            # Linear ramp (constant d(rVt)/dm) — no inflection needed
            shape = m.copy()
            rvt_2d = _build_2d_free_vortex(shape, rvt_le, rvt_te, n_span)
            return cls(
                streamwise_stations=m,
                spanwise_stations=s,
                rVtheta=rvt_2d,
            )
        else:
            peak = inflection if inflection is not None else 0.45

        # Generate S-curve via cubic Bezier
        shape = _bezier_s_curve(m, peak)

        # Build 2-D array (free-vortex: same shape at all spans)
        rvt_2d = _build_2d_free_vortex(shape, rvt_le, rvt_te, n_span)

        return cls(
            streamwise_stations=m,
            spanwise_stations=s,
            rVtheta=rvt_2d,
        )

    # --- Normalization -----------------------------------------------------

    def normalize_to_euler(
        self,
        r1: float,
        cu1: float,
        r2: float,
        cu2: float,
    ) -> None:
        """Scale rVtheta so the integral matches the Euler head requirement.

        The integral of d(rVtheta)/dm from 0 to 1 must equal
        (r2 * cu2 - r1 * cu1).

        Args:
            r1: Inlet radius [m].
            cu1: Inlet tangential velocity [m/s].
            r2: Outlet radius [m].
            cu2: Outlet tangential velocity [m/s].
        """
        target_delta = r2 * cu2 - r1 * cu1

        for i in range(self.rVtheta.shape[0]):
            row = self.rVtheta[i, :]
            actual_delta = row[-1] - row[0]
            if abs(actual_delta) < 1e-12:
                continue
            scale = target_delta / actual_delta
            self.rVtheta[i, :] = row[0] + (row - row[0]) * scale

    # --- Loading derivative ------------------------------------------------

    def drvt_dm(self) -> np.ndarray:
        """Compute d(rVtheta)/dm at each (span, chord) station.

        Returns:
            2-D array [n_span, n_chord] of loading derivatives.
        """
        return np.gradient(self.rVtheta, self.streamwise_stations, axis=1)

    # --- Serialization -----------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        return {
            "streamwise_stations": self.streamwise_stations.tolist(),
            "spanwise_stations": self.spanwise_stations.tolist(),
            "rVtheta": self.rVtheta.tolist(),
            "drvt_dm": self.drvt_dm().tolist(),
        }


# ---------------------------------------------------------------------------
# Predefined templates (convenience constants)
# ---------------------------------------------------------------------------

FRONT_LOADED = LoadingTemplate.FRONT_LOADED
"""Peak loading at 20-30% chord. Good for low Nq, reduces exit separation."""

MID_LOADED = LoadingTemplate.MID_LOADED
"""Peak at 40-50% chord. Balanced, most common choice."""

AFT_LOADED = LoadingTemplate.AFT_LOADED
"""Peak at 60-70% chord. Reduces shock losses at inlet."""

CONTROLLED_DIFFUSION = LoadingTemplate.CONTROLLED_DIFFUSION
"""Constant deceleration rate. Minimizes boundary layer growth."""


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@dataclass
class LoadingValidationResult:
    """Result of loading distribution validation."""

    valid: bool
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def validate_loading(
    loading: LoadingDistribution,
    r1: float,
    r2: float,
    omega: float,
    flow_rate: float,
    b2: float,
) -> LoadingValidationResult:
    """Validate a loading distribution for physical feasibility.

    Checks:
        1. Negative loading (d(rVt)/dm < 0 when overall delta > 0).
        2. Excessive diffusion (deceleration ratio > 0.72 de Haller limit).
        3. Reverse flow risk (cm becomes negative or near-zero).

    Args:
        loading: The loading distribution to validate.
        r1: Inlet radius [m].
        r2: Outlet radius [m].
        omega: Angular velocity [rad/s].
        flow_rate: Volume flow rate [m^3/s].
        b2: Outlet width [m].

    Returns:
        LoadingValidationResult with warnings and errors.
    """
    warnings: list[str] = []
    errors: list[str] = []

    drvt = loading.drvt_dm()
    overall_delta = loading.rVtheta[:, -1] - loading.rVtheta[:, 0]

    # --- Check 1: Negative loading -----------------------------------------
    for i in range(drvt.shape[0]):
        span_frac = loading.spanwise_stations[i]
        sign_expected = np.sign(overall_delta[i])
        if sign_expected == 0:
            continue
        negative_pts = np.sum(np.sign(drvt[i, :]) != sign_expected)
        frac_negative = negative_pts / drvt.shape[1]
        if frac_negative > 0.05:
            warnings.append(
                f"Span {span_frac:.2f}: {frac_negative:.0%} of chord has "
                f"loading opposite to overall delta rVtheta."
            )
        if frac_negative > 0.20:
            errors.append(
                f"Span {span_frac:.2f}: excessive negative loading "
                f"({frac_negative:.0%} of chord). Risk of flow separation."
            )

    # --- Check 2: Excessive diffusion (simplified) -------------------------
    # Estimate w1/w2 from rVtheta distribution
    u1 = omega * r1
    u2 = omega * r2
    # Meridional velocity at outlet (simplified)
    cm2 = flow_rate / (2.0 * math.pi * r2 * b2) if (r2 * b2 > 0) else 1.0
    # Midspan check
    mid_idx = drvt.shape[0] // 2
    rvt_out = loading.rVtheta[mid_idx, -1]
    cu2_est = rvt_out / r2 if r2 > 0 else 0.0
    wu2 = u2 - cu2_est
    w2 = math.sqrt(cm2**2 + wu2**2)

    rvt_in = loading.rVtheta[mid_idx, 0]
    cu1_est = rvt_in / r1 if r1 > 0 else 0.0
    cm1 = flow_rate / (2.0 * math.pi * r1 * (b2 * 1.2)) if (r1 > 0) else cm2
    wu1 = u1 - cu1_est
    w1 = math.sqrt(cm1**2 + wu1**2)

    if w1 > 1e-6:
        de_haller = w2 / w1
        if de_haller < 0.65:
            errors.append(
                f"De Haller ratio w2/w1 = {de_haller:.3f} < 0.65. "
                f"Severe diffusion — likely flow separation."
            )
        elif de_haller < 0.72:
            warnings.append(
                f"De Haller ratio w2/w1 = {de_haller:.3f} < 0.72. "
                f"Consider reducing loading magnitude."
            )

    # --- Check 3: Reverse flow risk ----------------------------------------
    max_drvt = np.max(np.abs(drvt))
    if max_drvt > 0 and cm2 > 0:
        # If blade loading gradient exceeds meridional velocity scale,
        # there's risk of reverse flow on the suction side
        loading_ratio = max_drvt / (cm2 * r2)
        if loading_ratio > 5.0:
            errors.append(
                f"Loading gradient ratio = {loading_ratio:.1f} > 5.0. "
                f"High risk of reverse flow on suction side."
            )
        elif loading_ratio > 3.0:
            warnings.append(
                f"Loading gradient ratio = {loading_ratio:.1f} > 3.0. "
                f"Consider smoother loading distribution."
            )

    valid = len(errors) == 0
    return LoadingValidationResult(valid=valid, warnings=warnings, errors=errors)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _bezier_s_curve(m: np.ndarray, peak: float) -> np.ndarray:
    """Generate a smooth S-curve loading shape via cubic Bezier.

    The curve maps m in [0, 1] -> f in [0, 1] with:
        f(0) = 0, f(1) = 1
        Maximum df/dm near `peak`.

    The inflection (steepest slope) occurs at the `peak` location.

    Args:
        m: Normalized chord array.
        peak: Location of maximum loading gradient in [0, 1].

    Returns:
        Normalized shape f(m) in [0, 1].
    """
    # Cubic Bezier control points: P0=(0,0), P1=(peak, 0), P2=(peak, 1), P3=(1,1)
    # This places the steepest transition around m = peak
    p0 = np.array([0.0, 0.0])
    p1 = np.array([peak, 0.0])
    p2 = np.array([peak, 1.0])
    p3 = np.array([1.0, 1.0])

    # For each m, find the Bezier parameter t that gives x(t) = m
    # Use Newton's method for accuracy
    result = np.zeros_like(m)
    for i, mi in enumerate(m):
        if mi <= 0.0:
            result[i] = 0.0
            continue
        if mi >= 1.0:
            result[i] = 1.0
            continue
        t = mi  # initial guess
        for _ in range(20):
            # x(t) = (1-t)^3*p0x + 3(1-t)^2*t*p1x + 3(1-t)*t^2*p2x + t^3*p3x
            omt = 1.0 - t
            xt = (omt**3 * p0[0]
                  + 3.0 * omt**2 * t * p1[0]
                  + 3.0 * omt * t**2 * p2[0]
                  + t**3 * p3[0])
            # dx/dt
            dxt = (3.0 * omt**2 * (p1[0] - p0[0])
                   + 6.0 * omt * t * (p2[0] - p1[0])
                   + 3.0 * t**2 * (p3[0] - p2[0]))
            if abs(dxt) < 1e-15:
                break
            t = t - (xt - mi) / dxt
            t = max(0.0, min(1.0, t))

        # y(t)
        omt = 1.0 - t
        yt = (omt**3 * p0[1]
              + 3.0 * omt**2 * t * p1[1]
              + 3.0 * omt * t**2 * p2[1]
              + t**3 * p3[1])
        result[i] = max(0.0, min(1.0, yt))

    return result


def _build_2d_free_vortex(
    shape: np.ndarray,
    rvt_le: float,
    rvt_te: float,
    n_span: int,
) -> np.ndarray:
    """Build 2-D rVtheta array assuming free-vortex (constant rVt across span).

    Args:
        shape: Normalized shape function f(m) in [0, 1], length n_chord.
        rvt_le: rVtheta at leading edge [m^2/s].
        rvt_te: rVtheta at trailing edge [m^2/s].
        n_span: Number of spanwise stations.

    Returns:
        2-D array of shape (n_span, n_chord).
    """
    rvt_1d = rvt_le + (rvt_te - rvt_le) * shape
    return np.tile(rvt_1d, (n_span, 1))
