"""HPE Post-processing — Automated metric extraction from CFD simulations.

Usage:
    from hpe.postprocess.openfoam_parser import parse_solver_log, parse_forces
    from hpe.postprocess.metrics import calc_performance_from_cfd
"""

from hpe.postprocess.metrics import CFDMetrics, calc_performance_from_cfd
from hpe.postprocess.openfoam_parser import parse_forces, parse_solver_log

__all__ = [
    "parse_solver_log",
    "parse_forces",
    "calc_performance_from_cfd",
    "CFDMetrics",
]
