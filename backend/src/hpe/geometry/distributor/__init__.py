"""Distributor (guide vanes) parametric geometry generation.

Usage:
    from hpe.geometry.distributor import generate_distributor_from_sizing
    distributor = generate_distributor_from_sizing(sizing_result)
"""

from hpe.geometry.distributor.guide_vanes import (
    generate_distributor,
    generate_distributor_from_sizing,
)

__all__ = ["generate_distributor", "generate_distributor_from_sizing"]
