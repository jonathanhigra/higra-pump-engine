"""HPE Geometry — Parametric 3D geometry generation for hydraulic components.

Generates parametric 3D geometries from sizing data or user-defined parameters.

Components:
- Runner (impeller): parameterized blade profiles, inlet/outlet angles, thickness, blade count
- Distributor (guide vanes): opening control and profile [future]
- Volute (spiral casing): area distribution, tongue radius, twin entry support [future]
- Draft tube: for Francis turbines [future]

Usage:
    from hpe.geometry.runner import generate_runner, generate_runner_from_sizing
    from hpe.geometry.runner.export import export_runner
"""

from hpe.geometry.runner.impeller import generate_runner, generate_runner_from_sizing

__all__ = ["generate_runner", "generate_runner_from_sizing"]
