"""Optimization problem definition.

Defines design variables, bounds, objectives, and constraints
for centrifugal pump impeller optimization.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


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

    @property
    def n_variables(self) -> int:
        return len(self.variables)

    @property
    def n_objectives(self) -> int:
        return len(self.objectives)

    def variable_bounds(self) -> list[tuple[float, float]]:
        """Return list of (lower, upper) bounds."""
        return [(v.lower, v.upper) for v in self.variables]
