"""HPE Pipeline — Bidirectional CAE integration pipeline.

Orchestrates: Geometry → Mesh → Solver → Post-processing → Database.

Usage:
    from hpe.pipeline import run_cfd_pipeline
    result = run_cfd_pipeline(sizing, "./output/pump_case")
"""

from hpe.pipeline.cfd_pipeline import run_cfd_pipeline

__all__ = ["run_cfd_pipeline"]
