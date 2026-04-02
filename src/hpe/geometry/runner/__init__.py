"""Runner (impeller) parametric geometry generation.

Handles blade profile parametrization, meridional channel definition,
and 3D solid generation via CadQuery + OpenCascade.

Usage:
    from hpe.sizing import run_sizing
    from hpe.core.models import OperatingPoint
    from hpe.geometry.runner import generate_runner_from_sizing

    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    sizing = run_sizing(op)
    runner = generate_runner_from_sizing(sizing)
"""

from hpe.geometry.runner.impeller import generate_runner, generate_runner_from_sizing

__all__ = ["generate_runner", "generate_runner_from_sizing"]
