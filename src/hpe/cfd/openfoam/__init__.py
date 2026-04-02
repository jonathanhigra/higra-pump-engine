"""OpenFOAM solver integration — case building, BCs, and execution.

Usage:
    from hpe.cfd.openfoam.case_builder import build_case
    case_dir = build_case(sizing, "impeller.step", "./case_pump")
"""

from hpe.cfd.openfoam.case_builder import build_case

__all__ = ["build_case"]
