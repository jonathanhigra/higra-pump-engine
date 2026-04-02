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

def __getattr__(name: str):  # type: ignore[no-untyped-def]
    if name in ("generate_runner", "generate_runner_from_sizing"):
        from hpe.geometry.runner.impeller import generate_runner, generate_runner_from_sizing
        return {"generate_runner": generate_runner, "generate_runner_from_sizing": generate_runner_from_sizing}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = ["generate_runner", "generate_runner_from_sizing"]
