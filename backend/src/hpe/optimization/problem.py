"""Optimization problem definition.

Defines design variables, bounds, objectives, and constraints
for centrifugal pump impeller optimization.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class DesignVariable:
    """A single design variable with bounds."""

    name: str
    lower: float
    upper: float
    is_integer: bool = False


@dataclass
class OptimizationProblem:
    """Multi-objective optimization problem for pump impeller design.

    Design variables are factors applied to the baseline sizing result,
    so the optimizer explores variations around the 1D sizing point.
    """

    # Operating point (fixed)
    flow_rate: float  # Q [m^3/s]
    head: float  # H [m]
    rpm: float  # n [rev/min]

    # Design variables
    variables: list[DesignVariable] = field(default_factory=list)

    # Objective names and directions (True = maximize, False = minimize)
    objectives: dict[str, bool] = field(default_factory=dict)

    # Constraint limits
    max_tip_speed: float = 55.0  # u2 max [m/s]
    min_beta1: float = 10.0  # Minimum inlet blade angle [deg]
    min_euler_ratio: float = 0.90  # H_euler / H_required minimum
    max_euler_ratio: float = 1.15  # H_euler / H_required maximum

    @classmethod
    def default(
        cls,
        flow_rate: float,
        head: float,
        rpm: float,
    ) -> OptimizationProblem:
        """Create default optimization problem for centrifugal pump.

        4 free variables, 3 objectives.
        """
        return cls(
            flow_rate=flow_rate,
            head=head,
            rpm=rpm,
            variables=[
                DesignVariable("beta2", 15.0, 40.0),
                DesignVariable("d2_factor", 0.85, 1.15),
                DesignVariable("b2_factor", 0.80, 1.20),
                DesignVariable("blade_count", 5, 10, is_integer=True),
            ],
            objectives={
                "efficiency": True,   # Maximize
                "npsh_r": False,      # Minimize
                "robustness": True,   # Maximize
            },
        )

    @classmethod
    def expanded(
        cls,
        flow_rate: float,
        head: float,
        rpm: float,
        *,
        beta2_bounds: tuple[float, float] = (15.0, 40.0),
        d2_factor_bounds: tuple[float, float] = (0.85, 1.15),
        b2_factor_bounds: tuple[float, float] = (0.80, 1.20),
        blade_count_bounds: tuple[int, int] = (5, 10),
        nc_bounds: tuple[float, float] = (0.70, 1.00),
        nd_bounds: tuple[float, float] = (0.70, 1.00),
        d1_d2_bounds: tuple[float, float] = (0.35, 0.65),
    ) -> OptimizationProblem:
        """Create expanded optimization problem with 7 design variables.

        Additional variables vs default():
            nc        — inlet loading coefficient (cm1/u1 correction factor)
            nd        — outlet loading coefficient (cu2/u2 correction factor)
            d1_d2     — inlet-to-outlet diameter ratio (replaces derived scaling)
        All bounds are configurable.
        """
        return cls(
            flow_rate=flow_rate,
            head=head,
            rpm=rpm,
            variables=[
                DesignVariable("beta2", *beta2_bounds),
                DesignVariable("d2_factor", *d2_factor_bounds),
                DesignVariable("b2_factor", *b2_factor_bounds),
                DesignVariable("blade_count", *blade_count_bounds, is_integer=True),
                DesignVariable("nc", *nc_bounds),
                DesignVariable("nd", *nd_bounds),
                DesignVariable("d1_d2", *d1_d2_bounds),
            ],
            objectives={
                "efficiency": True,   # Maximize
                "npsh_r": False,      # Minimize
                "robustness": True,   # Maximize
            },
        )

    @classmethod
    def extended(
        cls,
        flow_rate: float,
        head: float,
        rpm: float,
        *,
        beta2_bounds: tuple[float, float] = (15.0, 40.0),
        d2_factor_bounds: tuple[float, float] = (0.85, 1.15),
        b2_factor_bounds: tuple[float, float] = (0.80, 1.20),
        blade_count_bounds: tuple[int, int] = (5, 10),
        nc_bounds: tuple[float, float] = (0.70, 1.00),
        nd_bounds: tuple[float, float] = (0.70, 1.00),
        d1_d2_bounds: tuple[float, float] = (0.35, 0.65),
    ) -> OptimizationProblem:
        """Create extended 5-objective problem (F5).

        Objectives beyond default():
            profile_loss_total — Minimize total blade profile loss coefficient
            pmin_pa            — Maximize minimum static pressure [Pa]
        Uses the 7 expanded design variables from expanded().
        """
        return cls(
            flow_rate=flow_rate,
            head=head,
            rpm=rpm,
            variables=[
                DesignVariable("beta2", *beta2_bounds),
                DesignVariable("d2_factor", *d2_factor_bounds),
                DesignVariable("b2_factor", *b2_factor_bounds),
                DesignVariable("blade_count", *blade_count_bounds, is_integer=True),
                DesignVariable("nc", *nc_bounds),
                DesignVariable("nd", *nd_bounds),
                DesignVariable("d1_d2", *d1_d2_bounds),
            ],
            objectives={
                "efficiency": True,            # Maximize
                "npsh_r": False,               # Minimize
                "robustness": True,            # Maximize
                "profile_loss_total": False,   # Minimize
                "pmin_pa": True,               # Maximize
            },
        )

    def evaluate(
        self,
        design_vector: list[float],
        objectives: Optional[list[str]] = None,
    ) -> dict[str, float]:
        """Evaluate a design vector and return requested objective values.

        Args:
            design_vector: Values for each design variable in order.
            objectives: Optional subset of objective names to return.
                        If None, returns all objectives defined in self.objectives.

        Returns:
            Dict mapping objective name to its value.
        """
        from hpe.optimization.evaluator import evaluate_design

        result = evaluate_design(design_vector, self)
        obj_names = objectives if objectives is not None else list(self.objectives.keys())
        return {name: result.objectives.get(name, 0.0) for name in obj_names}

    @property
    def n_variables(self) -> int:
        return len(self.variables)

    @property
    def n_objectives(self) -> int:
        return len(self.objectives)

    def variable_bounds(self) -> list[tuple[float, float]]:
        """Return list of (lower, upper) bounds."""
        return [(v.lower, v.upper) for v in self.variables]


def check_constraints(result: Any, constraints: Optional[dict] = None) -> dict:
    """Check optimization constraints on a sizing result.

    Constraints dict keys (all optional, None = no constraint):
        throat_area_min     — minimum throat area [m²]
        diffusion_ratio_min — minimum de Haller number (e.g. 0.65)
        npsh_max            — maximum NPSHr [m]
        profile_loss_max    — maximum total profile loss coefficient
        bending_stress_max  — maximum bending stress [MPa]
        pmin_margin_min     — minimum Pmin safety margin above vapour pressure [Pa]

    Args:
        result: A SizingResult or any object with matching attributes.
        constraints: Dict of constraint name → limit value.

    Returns:
        Dict of {constraint_name: {"value": ..., "limit": ..., "satisfied": bool}}
    """
    if constraints is None:
        constraints = {}

    results_out: dict = {}

    if "diffusion_ratio_min" in constraints:
        dr = getattr(result, "diffusion_ratio", 1.0)
        lo = constraints["diffusion_ratio_min"]
        results_out["diffusion_ratio"] = {
            "value": dr,
            "limit": lo,
            "satisfied": dr >= lo,
        }

    if "npsh_max" in constraints:
        npsh = getattr(result, "estimated_npsh_r", 0.0)
        hi = constraints["npsh_max"]
        results_out["npsh"] = {
            "value": npsh,
            "limit": hi,
            "satisfied": npsh <= hi,
        }

    if "throat_area_min" in constraints:
        ta = getattr(result, "throat_area", 0.0)
        lo = constraints["throat_area_min"]
        results_out["throat_area"] = {
            "value": ta,
            "limit": lo,
            "satisfied": ta >= lo,
        }

    if "profile_loss_max" in constraints:
        pl = getattr(result, "profile_loss_total", 0.0)
        hi = constraints["profile_loss_max"]
        results_out["profile_loss"] = {
            "value": pl,
            "limit": hi,
            "satisfied": pl <= hi,
        }

    if "bending_stress_max" in constraints:
        bs = getattr(result, "bending_stress_mpa", 0.0)
        hi = constraints["bending_stress_max"]
        results_out["bending_stress"] = {
            "value": bs,
            "limit": hi,
            "satisfied": bs <= hi,
        }

    if "pmin_margin_min" in constraints:
        pmin = getattr(result, "pmin_pa", 101325.0)
        p_vap = 2340.0  # water at 20°C [Pa]
        margin = pmin - p_vap
        lo = constraints["pmin_margin_min"]
        results_out["pmin_margin"] = {
            "value": margin,
            "limit": lo,
            "satisfied": margin >= lo,
        }

    return results_out
