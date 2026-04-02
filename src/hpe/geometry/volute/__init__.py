"""Volute (spiral casing) parametric design module.

Usage:
    from hpe.geometry.volute import generate_volute_from_sizing
    volute = generate_volute_from_sizing(sizing_result)
"""

from hpe.geometry.volute.volute_3d import generate_volute, generate_volute_from_sizing

__all__ = ["generate_volute", "generate_volute_from_sizing"]
