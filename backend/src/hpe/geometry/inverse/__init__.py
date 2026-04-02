"""Inverse blade design via blade loading specification.

Generates blade geometry from a prescribed rVθ (angular momentum)
distribution, rather than specifying blade angles directly.

This is the core methodology of the ADT TURBOdesign approach:
instead of defining β1/β2 and integrating a spiral, the designer
prescribes the desired loading (drVθ/dm) along the blade and the
solver integrates to find the blade shape that produces it.

Usage:
    from hpe.geometry.inverse import inverse_design

    result = inverse_design(spec)
"""

from hpe.geometry.inverse.solver import inverse_design

__all__ = ["inverse_design"]
