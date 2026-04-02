"""Automatic mesh generation from CAD geometry.

Provides blockMeshDict and snappyHexMeshDict generators
for OpenFOAM meshing pipeline.
"""

from hpe.cfd.mesh.blockmesh import generate_blockmesh_dict
from hpe.cfd.mesh.snappy import generate_snappy_dict

__all__ = ["generate_blockmesh_dict", "generate_snappy_dict"]
