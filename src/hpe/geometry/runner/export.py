"""CAD export functions for runner geometry.

Supports STEP (for CAD/CAE), STL (for visualization/3D printing),
and IGES formats.
"""

from __future__ import annotations

from pathlib import Path

import cadquery as cq

from hpe.core.enums import GeometryFormat


def export_runner(
    runner: cq.Workplane,
    filepath: str | Path,
    fmt: GeometryFormat = GeometryFormat.STEP,
    stl_tolerance: float = 0.01,
    stl_angular_tolerance: float = 0.1,
) -> Path:
    """Export runner geometry to a CAD file.

    Args:
        runner: CadQuery Workplane with the runner solid.
        filepath: Output file path (extension will be adjusted if needed).
        fmt: Export format (STEP, STL, or IGES).
        stl_tolerance: Linear tolerance for STL tessellation [mm].
        stl_angular_tolerance: Angular tolerance for STL tessellation [deg].

    Returns:
        Path to the exported file.

    Raises:
        ValueError: If format is not supported.
    """
    filepath = Path(filepath)

    # Ensure correct extension
    extensions = {
        GeometryFormat.STEP: ".step",
        GeometryFormat.STL: ".stl",
        GeometryFormat.IGES: ".iges",
    }
    expected_ext = extensions.get(fmt)
    if expected_ext and filepath.suffix.lower() != expected_ext:
        filepath = filepath.with_suffix(expected_ext)

    # Ensure parent directory exists
    filepath.parent.mkdir(parents=True, exist_ok=True)

    if fmt == GeometryFormat.STEP:
        cq.exporters.export(runner, str(filepath), exportType="STEP")
    elif fmt == GeometryFormat.STL:
        cq.exporters.export(
            runner,
            str(filepath),
            exportType="STL",
            tolerance=stl_tolerance,
            angularTolerance=stl_angular_tolerance,
        )
    elif fmt == GeometryFormat.IGES:
        cq.exporters.export(runner, str(filepath), exportType="IGES")
    else:
        raise ValueError(f"Unsupported export format: {fmt}")

    return filepath
