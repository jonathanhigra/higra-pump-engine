"""Iterative convergence solver for inverse blade design.

Implements the design iteration loop:
    1. Initial guess from 1D meanline sizing (blade angles, wrap angles)
    2. Inner loop: geometry -> velocity field -> new blade angles -> update
    3. Convergence based on max |delta_beta| or max |delta_wrap_angle|

The velocity field uses:
    - Continuity: cm = Q / (2*pi*r*b*(1 - blockage))
    - Prescribed loading: d(rVtheta)/dm from LoadingDistribution
    - Slip correction: Wiesner or Stodola

References:
    - Zangeneh (1991). Compressible 3-D inverse design for turbomachinery.
    - Gulich (2014). Centrifugal Pumps, Ch. 7.
    - Pfleiderer & Petermann (2005). Stroemungsmaschinen.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from hpe.sizing.blade_loading import (
    LoadingDistribution,
    LoadingTemplate,
    validate_loading,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class ConvergenceConfig:
    """Configuration for the convergence solver.

    Attributes:
        max_iterations: Maximum number of solver iterations.
        beta_tolerance_deg: Convergence criterion on max |delta_beta| [deg].
        wrap_angle_tolerance_deg: Convergence criterion on max |delta_wrap| [deg].
        damping_factor: Under-relaxation factor omega (new = old + omega*(computed - old)).
        slip_model: Slip factor model ("wiesner" or "stodola").
        blockage_inlet: Blade blockage factor at inlet [-].
        blockage_outlet: Blade blockage factor at outlet [-].
    """

    max_iterations: int = 50
    beta_tolerance_deg: float = 0.1
    wrap_angle_tolerance_deg: float = 0.5
    damping_factor: float = 0.5
    slip_model: str = "wiesner"
    blockage_inlet: float = 0.92
    blockage_outlet: float = 0.90


# ---------------------------------------------------------------------------
# Iteration history record
# ---------------------------------------------------------------------------

@dataclass
class IterationRecord:
    """Single iteration snapshot."""

    iteration: int
    max_residual_deg: float
    wrap_angle_hub_deg: float
    wrap_angle_shroud_deg: float
    beta1_deg: float
    beta2_deg: float


# ---------------------------------------------------------------------------
# Solver result
# ---------------------------------------------------------------------------

@dataclass
class ConvergenceResult:
    """Output of the convergence solver."""

    converged: bool
    iterations: int
    max_residual_deg: float
    history: list[IterationRecord] = field(default_factory=list)

    # Final blade shape per spanwise station
    beta_distribution: np.ndarray | None = None   # [n_span, n_chord] in degrees
    wrap_angle_distribution: np.ndarray | None = None  # [n_span, n_chord] in degrees
    blade_angles_inlet: list[float] = field(default_factory=list)  # [n_span] degrees
    blade_angles_outlet: list[float] = field(default_factory=list)  # [n_span] degrees
    wrap_angles: list[float] = field(default_factory=list)  # [n_span] degrees

    # Loading validation
    loading_warnings: list[str] = field(default_factory=list)
    loading_errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        return {
            "converged": self.converged,
            "iterations": self.iterations,
            "max_residual_deg": round(self.max_residual_deg, 6),
            "history": [
                {
                    "iteration": h.iteration,
                    "max_residual_deg": round(h.max_residual_deg, 6),
                    "wrap_angle_hub_deg": round(h.wrap_angle_hub_deg, 3),
                    "wrap_angle_shroud_deg": round(h.wrap_angle_shroud_deg, 3),
                    "beta1_deg": round(h.beta1_deg, 3),
                    "beta2_deg": round(h.beta2_deg, 3),
                }
                for h in self.history
            ],
            "blade_angles_inlet": [round(b, 3) for b in self.blade_angles_inlet],
            "blade_angles_outlet": [round(b, 3) for b in self.blade_angles_outlet],
            "wrap_angles": [round(w, 3) for w in self.wrap_angles],
            "beta_distribution": (
                self.beta_distribution.tolist()
                if self.beta_distribution is not None
                else []
            ),
            "wrap_angle_distribution": (
                self.wrap_angle_distribution.tolist()
                if self.wrap_angle_distribution is not None
                else []
            ),
            "loading_warnings": self.loading_warnings,
            "loading_errors": self.loading_errors,
        }


# ---------------------------------------------------------------------------
# Convergence Solver
# ---------------------------------------------------------------------------

class ConvergenceSolver:
    """Iterative blade design convergence solver.

    Given a 1D meanline sizing result and a prescribed loading distribution,
    iterates to find consistent blade angles and wrap angles that satisfy
    both the velocity field (continuity + loading) and the geometry.

    Args:
        flow_rate: Volume flow rate Q [m^3/s].
        rpm: Rotational speed [rev/min].
        r1: Inlet radius [m].
        r2: Outlet radius [m].
        b1: Inlet width [m].
        b2: Outlet width [m].
        blade_count: Number of blades Z.
        beta1_init: Initial guess for inlet blade angle [deg].
        beta2_init: Initial guess for outlet blade angle [deg].
        loading: Prescribed blade loading distribution.
        config: Solver configuration.
    """

    def __init__(
        self,
        flow_rate: float,
        rpm: float,
        r1: float,
        r2: float,
        b1: float,
        b2: float,
        blade_count: int,
        beta1_init: float,
        beta2_init: float,
        loading: LoadingDistribution,
        config: ConvergenceConfig | None = None,
    ) -> None:
        self.Q = flow_rate
        self.rpm = rpm
        self.omega = 2.0 * math.pi * rpm / 60.0
        self.r1 = r1
        self.r2 = r2
        self.b1 = b1
        self.b2 = b2
        self.Z = blade_count
        self.beta1_init = beta1_init
        self.beta2_init = beta2_init
        self.loading = loading
        self.config = config or ConvergenceConfig()

    def solve(self) -> ConvergenceResult:
        """Run the iterative convergence loop.

        Returns:
            ConvergenceResult with history and final blade shape.
        """
        cfg = self.config
        n_span = len(self.loading.spanwise_stations)
        n_chord = len(self.loading.streamwise_stations)
        m = self.loading.streamwise_stations

        # Radii along chord (linear interpolation hub-to-shroud at each m)
        r_chord = np.linspace(self.r1, self.r2, n_chord)

        # Width along chord (linear interpolation)
        b_chord = np.linspace(self.b1, self.b2, n_chord)

        # Peripheral velocity along chord
        u_chord = self.omega * r_chord

        # Blockage along chord (linear interpolation)
        blockage = np.linspace(
            cfg.blockage_inlet, cfg.blockage_outlet, n_chord
        )

        # Slip factor
        slip = self._calc_slip_factor(self.beta2_init)

        # --- Initial blade angle distribution [n_span, n_chord] ---
        beta = np.zeros((n_span, n_chord))
        for i in range(n_span):
            beta[i, :] = np.linspace(self.beta1_init, self.beta2_init, n_chord)

        # --- Loading derivative d(rVt)/dm ---
        drvt_dm = self.loading.drvt_dm()

        history: list[IterationRecord] = []
        converged = False
        max_residual = 999.0

        for iteration in range(1, cfg.max_iterations + 1):
            beta_new = np.zeros_like(beta)

            for i in range(n_span):
                for j in range(n_chord):
                    r = r_chord[j]
                    b = b_chord[j]
                    blk = blockage[j]
                    u = u_chord[j]

                    # Meridional velocity from continuity
                    cm = self.Q / (2.0 * math.pi * r * b * blk)

                    # Tangential velocity from loading
                    rvt = self.loading.rVtheta[i, j]
                    cu = rvt / r if r > 1e-9 else 0.0

                    # Apply slip at outlet region (last 20% of chord)
                    if m[j] > 0.80:
                        t_slip = (m[j] - 0.80) / 0.20
                        cu = cu * (1.0 - t_slip * (1.0 - slip))

                    # Relative tangential velocity
                    wu = u - cu

                    # Blade angle: beta = atan(cm / wu)
                    if abs(wu) > 1e-9:
                        beta_computed = math.degrees(math.atan2(cm, wu))
                    else:
                        beta_computed = 90.0

                    beta_computed = max(5.0, min(85.0, beta_computed))
                    beta_new[i, j] = beta_computed

            # Under-relaxation
            omega_damp = cfg.damping_factor
            beta_updated = beta + omega_damp * (beta_new - beta)

            # Compute residual
            delta = np.abs(beta_updated - beta)
            max_residual = float(np.max(delta))

            # Compute wrap angles for history tracking
            wrap_angles = self._compute_wrap_angles(
                beta_updated, r_chord, m
            )

            record = IterationRecord(
                iteration=iteration,
                max_residual_deg=max_residual,
                wrap_angle_hub_deg=wrap_angles[0],
                wrap_angle_shroud_deg=wrap_angles[-1],
                beta1_deg=float(np.mean(beta_updated[:, 0])),
                beta2_deg=float(np.mean(beta_updated[:, -1])),
            )
            history.append(record)

            log.debug(
                "Iteration %d: max_residual=%.4f deg, wrap_hub=%.1f deg, "
                "wrap_shroud=%.1f deg",
                iteration, max_residual,
                wrap_angles[0], wrap_angles[-1],
            )

            beta = beta_updated

            # Check convergence
            if max_residual < cfg.beta_tolerance_deg:
                converged = True
                log.info(
                    "Converged after %d iterations (max residual %.4f deg).",
                    iteration, max_residual,
                )
                break

            # Also check wrap angle convergence if we have at least 2 records
            if len(history) >= 2:
                prev_wrap_hub = history[-2].wrap_angle_hub_deg
                prev_wrap_shroud = history[-2].wrap_angle_shroud_deg
                dw_hub = abs(wrap_angles[0] - prev_wrap_hub)
                dw_shroud = abs(wrap_angles[-1] - prev_wrap_shroud)
                if max(dw_hub, dw_shroud) < cfg.wrap_angle_tolerance_deg:
                    converged = True
                    log.info(
                        "Converged on wrap angle after %d iterations.",
                        iteration,
                    )
                    break

        # Final wrap angles and blade shape
        final_wrap = self._compute_wrap_angles(beta, r_chord, m)
        wrap_dist = self._compute_wrap_distribution(beta, r_chord, m)

        # Validate loading
        val_result = validate_loading(
            self.loading,
            self.r1, self.r2,
            self.omega,
            self.Q,
            self.b2,
        )

        return ConvergenceResult(
            converged=converged,
            iterations=len(history),
            max_residual_deg=max_residual,
            history=history,
            beta_distribution=beta,
            wrap_angle_distribution=wrap_dist,
            blade_angles_inlet=[float(beta[i, 0]) for i in range(n_span)],
            blade_angles_outlet=[float(beta[i, -1]) for i in range(n_span)],
            wrap_angles=[float(w) for w in final_wrap],
            loading_warnings=val_result.warnings,
            loading_errors=val_result.errors,
        )

    # --- Private helpers ---------------------------------------------------

    def _calc_slip_factor(self, beta2: float) -> float:
        """Compute slip factor using the configured model."""
        b2r = math.radians(beta2)
        if self.config.slip_model == "stodola":
            sigma = 1.0 - (math.pi * math.sin(b2r)) / self.Z
        else:
            # Wiesner (default)
            sigma = 1.0 - math.sqrt(math.sin(b2r)) / (self.Z ** 0.7)
        return max(0.50, min(0.95, sigma))

    def _compute_wrap_angles(
        self,
        beta: np.ndarray,
        r_chord: np.ndarray,
        m: np.ndarray,
    ) -> np.ndarray:
        """Compute total wrap angle for each spanwise station [deg].

        wrap_angle = integral of (1 / (r * tan(beta))) * dr along chord.

        Args:
            beta: Blade angle distribution [n_span, n_chord] in degrees.
            r_chord: Radii along chord [n_chord].
            m: Normalized chord coordinates [n_chord].

        Returns:
            Wrap angle per span station [n_span] in degrees.
        """
        n_span = beta.shape[0]
        n_chord = beta.shape[1]
        wrap = np.zeros(n_span)

        for i in range(n_span):
            theta = 0.0
            for j in range(1, n_chord):
                dr = r_chord[j] - r_chord[j - 1]
                r_mid = 0.5 * (r_chord[j] + r_chord[j - 1])
                beta_mid = 0.5 * (beta[i, j] + beta[i, j - 1])
                tan_b = math.tan(math.radians(beta_mid))
                if abs(tan_b) > 1e-9 and r_mid > 1e-9:
                    theta += dr / (r_mid * tan_b)
            wrap[i] = math.degrees(theta)

        return wrap

    def _compute_wrap_distribution(
        self,
        beta: np.ndarray,
        r_chord: np.ndarray,
        m: np.ndarray,
    ) -> np.ndarray:
        """Compute cumulative wrap angle at each (span, chord) point.

        Args:
            beta: Blade angle distribution [n_span, n_chord] in degrees.
            r_chord: Radii along chord [n_chord].
            m: Normalized chord coordinates [n_chord].

        Returns:
            Wrap angle distribution [n_span, n_chord] in degrees.
        """
        n_span = beta.shape[0]
        n_chord = beta.shape[1]
        wrap = np.zeros((n_span, n_chord))

        for i in range(n_span):
            for j in range(1, n_chord):
                dr = r_chord[j] - r_chord[j - 1]
                r_mid = 0.5 * (r_chord[j] + r_chord[j - 1])
                beta_mid = 0.5 * (beta[i, j] + beta[i, j - 1])
                tan_b = math.tan(math.radians(beta_mid))
                if abs(tan_b) > 1e-9 and r_mid > 1e-9:
                    wrap[i, j] = wrap[i, j - 1] + math.degrees(
                        dr / (r_mid * tan_b)
                    )
                else:
                    wrap[i, j] = wrap[i, j - 1]

        return wrap


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------

def run_convergence(
    flow_rate: float,
    head: float,
    rpm: float,
    r1: float,
    r2: float,
    b1: float,
    b2: float,
    blade_count: int,
    beta1: float,
    beta2: float,
    loading_type: str = "mid_loaded",
    n_chord: int = 51,
    n_span: int = 5,
    max_iterations: int = 50,
    damping_factor: float = 0.5,
    slip_model: str = "wiesner",
) -> ConvergenceResult:
    """Run a full convergence solve from sizing parameters.

    This is the main entry point, suitable for calling from the API.

    Args:
        flow_rate: Q [m^3/s].
        head: H [m].
        rpm: Rotational speed [rev/min].
        r1: Inlet radius [m].
        r2: Outlet radius [m].
        b1: Inlet width [m].
        b2: Outlet width [m].
        blade_count: Number of blades Z.
        beta1: Initial inlet blade angle [deg].
        beta2: Initial outlet blade angle [deg].
        loading_type: One of "front_loaded", "mid_loaded", "aft_loaded",
            "controlled_diffusion".
        n_chord: Number of streamwise stations.
        n_span: Number of spanwise stations.
        max_iterations: Maximum solver iterations.
        damping_factor: Under-relaxation factor [0.3, 0.7].
        slip_model: "wiesner" or "stodola".

    Returns:
        ConvergenceResult with iteration history and final blade shape.
    """
    omega = 2.0 * math.pi * rpm / 60.0
    u2 = omega * r2
    u1 = omega * r1

    # Estimate cu1 and cu2 from Euler equation
    g = 9.80665
    # Assume no pre-swirl: cu1 = 0
    cu1 = 0.0
    cu2 = g * head / u2 if u2 > 1e-9 else 0.0

    template = LoadingTemplate(loading_type)
    loading = LoadingDistribution.from_type(
        loading_type=template,
        cu1=cu1,
        cu2=cu2,
        r1=r1,
        r2=r2,
        n_chord=n_chord,
        n_span=n_span,
    )

    # Normalize to match Euler head
    loading.normalize_to_euler(r1, cu1, r2, cu2)

    config = ConvergenceConfig(
        max_iterations=max_iterations,
        damping_factor=max(0.3, min(0.7, damping_factor)),
        slip_model=slip_model,
    )

    solver = ConvergenceSolver(
        flow_rate=flow_rate,
        rpm=rpm,
        r1=r1,
        r2=r2,
        b1=b1,
        b2=b2,
        blade_count=blade_count,
        beta1_init=beta1,
        beta2_init=beta2,
        loading=loading,
        config=config,
    )

    return solver.solve()
