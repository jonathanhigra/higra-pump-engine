"""Automatic mesh generation from CAD geometry.

Provides blockMeshDict and snappyHexMeshDict generators
for OpenFOAM meshing pipeline.

Modules
-------
snappy
    Unstructured snappyHexMesh pipeline (wraps around an STL surface).
structured_blade
    Structured O-H blade-to-blade mesh for single-passage simulations.
yplus
    First-cell wall-normal height estimation from y+ target.
periodic
    Periodic (cyclic) boundary condition setup for blade pitch.
"""

from hpe.cfd.mesh.blockmesh import generate_blockmesh_dict
from hpe.cfd.mesh.snappy import generate_snappy_dict, write_block_mesh_dict, write_snappy_hex_mesh_dict
from hpe.cfd.mesh.structured_blade import MeshConfig, generate_structured_blade_mesh
from hpe.cfd.mesh.yplus import (
    YPlusEstimate,
    compute_first_cell_height,
    estimate_blade_chord,
    o_layer_thickness,
)
from hpe.cfd.mesh.periodic import (
    PeriodicConfig,
    write_create_patch_dict,
    write_periodic_boundary_conditions,
    get_periodic_blockmesh_bc_entry,
)

__all__ = [
    # blockmesh / snappy
    "generate_blockmesh_dict",
    "generate_snappy_dict",
    "write_block_mesh_dict",
    "write_snappy_hex_mesh_dict",
    # structured blade
    "MeshConfig",
    "generate_structured_blade_mesh",
    # y+
    "YPlusEstimate",
    "compute_first_cell_height",
    "estimate_blade_chord",
    "o_layer_thickness",
    # periodic
    "PeriodicConfig",
    "write_create_patch_dict",
    "write_periodic_boundary_conditions",
    "get_periodic_blockmesh_bc_entry",
]
