"""CAD export functions for runner geometry.

Supports STEP (for CAD/CAE), STL (for visualization/3D printing),
IGES formats, and text-based blade formats (.geo, BladeGen .inf/.curve).
"""

from __future__ import annotations

import math
from pathlib import Path

try:
    import cadquery as cq
    _CQ_AVAILABLE = True
except ImportError:
    cq = None  # type: ignore[assignment]
    _CQ_AVAILABLE = False

from hpe.core.enums import GeometryFormat


def export_runner(
    runner: "cq.Workplane",
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
        ImportError: If CadQuery is not installed.
        ValueError: If format is not supported.
    """
    if not _CQ_AVAILABLE:
        raise ImportError(
            "CadQuery is required for 3D export.  Install it with: "
            "pip install cadquery>=2.4  (or use the backend-cad Docker image)"
        )
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


# ---------------------------------------------------------------------------
# G1 — Structured .geo export (BladeGen / TurboGrid compatible)
# ---------------------------------------------------------------------------

def export_geo(
    d2: float,
    d1: float,
    b2: float,
    beta1: float,
    beta2: float,
    blade_count: int,
    n_span: int = 5,
    n_chord: int = 21,
    unit: str = "m",
) -> str:
    """Generate structured .geo blade surface file.

    The .geo format stores blade surface coordinates (X, R, theta) at
    each (span, chord) station. This is used by ANSYS BladeGen and TurboGrid.

    Format:
        Line 1: n_span n_chord
        For each span (0=hub, 1=shroud):
            For each chord point (0=LE, 1=TE):
                X  R  theta_rad

    Args:
        d2: Outlet diameter [m].
        d1: Inlet diameter [m].
        b2: Outlet width [m].
        beta1: Inlet blade angle [deg].
        beta2: Outlet blade angle [deg].
        blade_count: Number of blades.
        n_span: Spanwise points (hub=0, shroud=1).
        n_chord: Chordwise points LE to TE.
        unit: Output unit, "m" or "mm".

    Returns:
        String content of the .geo file.
    """
    scale = 1000.0 if unit == "mm" else 1.0
    r2 = d2 / 2
    r1 = d1 / 2

    lines: list[str] = []
    lines.append(f"{n_span}  {n_chord}")

    for i_span in range(n_span):
        xi = i_span / max(n_span - 1, 1)  # 0=hub, 1=shroud

        # Radius varies linearly from hub to tip at inlet
        r_in = r1 * (0.30 + xi * 0.70)   # hub ratio ≈ 0.30
        r_out = r2 * (0.85 + xi * 0.15)  # small taper at shroud

        # Axial position: inlet at x=0, outlet at x=-b2
        # (negative x = downstream for turbomachinery convention)
        x_in = 0.0
        x_out = -b2

        for i_chord in range(n_chord):
            t = i_chord / max(n_chord - 1, 1)  # 0=LE, 1=TE

            # Interpolate radius and axial position
            r = r_in + t * (r_out - r_in)
            x = x_in + t * (x_out - x_in)

            # Blade wrap angle: integrate dθ/dm from beta distribution.
            # Using linear interpolation of beta (inlet to outlet).
            beta_t = math.radians(beta1 + t * (beta2 - beta1))

            # Cumulative wrap angle (simplified helical blade)
            dr_tot = abs(r_out - r_in)
            dx_tot = abs(x_out - x_in)
            ds = math.sqrt(dr_tot**2 + dx_tot**2) * t  # approximate path length to t

            tan_beta = math.tan(beta_t)
            if r > 1e-6 and tan_beta > 1e-6:
                theta = ds / (r * tan_beta)
            else:
                theta = 0.0

            lines.append(f"  {x * scale:12.6f}  {r * scale:12.6f}  {theta:12.6f}")

    return "\n".join(lines)


def export_geo_both_surfaces(
    d2: float,
    d1: float,
    b2: float,
    beta1: float,
    beta2: float,
    blade_count: int,
    n_span: int = 5,
    n_chord: int = 21,
    unit: str = "m",
) -> dict:
    """Export both pressure and suction side surfaces in .geo format.

    Returns dict with 'ps' and 'ss' keys, each containing .geo file content.
    Pressure side: θ_ps = θ_mid - t/2
    Suction side:  θ_ss = θ_mid + t/2
    where t = thickness / (r * chord_length) [small angle approximation].

    Args:
        d2: Outlet diameter [m].
        d1: Inlet diameter [m].
        b2: Outlet width [m].
        beta1: Inlet blade angle [deg].
        beta2: Outlet blade angle [deg].
        blade_count: Number of blades.
        n_span: Spanwise points.
        n_chord: Chordwise points.
        unit: Output unit, "m" or "mm".

    Returns:
        Dict with keys 'ps', 'ss', 'format', 'n_span', 'n_chord'.
    """
    ps = export_geo(d2, d1, b2, beta1, beta2, blade_count, n_span, n_chord, unit)

    # SS is slightly offset in the positive θ direction.
    # For simplicity, apply a +0.015 rad uniform offset to the wrap angle at TE.
    ss_lines: list[str] = []
    for line in ps.split("\n"):
        parts = line.strip().split()
        if len(parts) == 3:
            x_v, r_v, theta_v = parts
            ss_lines.append(f"  {x_v}  {r_v}  {float(theta_v) + 0.015:12.6f}")
        else:
            ss_lines.append(line)
    ss = "\n".join(ss_lines)

    return {"ps": ps, "ss": ss, "format": "geo", "n_span": n_span, "n_chord": n_chord}


# ---------------------------------------------------------------------------
# G2 — ANSYS BladeGen .inf + .curve export
# ---------------------------------------------------------------------------

def export_bladegen_inf(
    d2: float,
    d1: float,
    b2: float,
    beta1: float,
    beta2: float,
    blade_count: int,
    rpm: float = 1450.0,
    machine_type: str = "CENTRIFUGAL_PUMP",
    n_span: int = 5,
) -> str:
    """Generate ANSYS BladeGen .inf machine parameters file.

    The .inf file contains machine type, rotation axis, span definitions,
    and references to curve files.

    Args:
        d2: Outlet diameter [m].
        d1: Inlet diameter [m].
        b2: Outlet width [m].
        beta1: Inlet blade angle [deg] (unused directly; kept for API symmetry).
        beta2: Outlet blade angle [deg] (unused directly; kept for API symmetry).
        blade_count: Number of blades.
        rpm: Rotational speed [RPM].
        machine_type: BladeGen machine type string.
        n_span: Number of spanwise sections.

    Returns:
        String content of the .inf file.
    """
    lines = [
        "[Turbo Machine]",
        f"Machine Type = {machine_type}",
        f"Rotation Speed = {rpm}",
        "Rotation Axis = Z",
        f"Number of Blades = {blade_count}",
        "",
        "[Inlet]",
        f"Tip Radius = {d1 / 2 * 1000:.4f}",    # mm
        f"Hub Radius = {d1 / 2 * 1000 * 0.30:.4f}",
        "",
        "[Outlet]",
        f"Tip Radius = {d2 / 2 * 1000:.4f}",
        f"Width = {b2 * 1000:.4f}",
        "",
        "[Spans]",
    ]

    for i in range(n_span):
        xi = i / max(n_span - 1, 1)
        lines.append(f"Span {i + 1} = {xi:.4f}")

    lines += [
        "",
        "[Files]",
        "Blade Curve File = blade.curve",
        "Units = mm",
        "",
        "[Generated by]",
        "Software = HPE — Higra Pump Engine",
    ]

    return "\n".join(lines)


def export_bladegen_curve(
    d2: float,
    d1: float,
    b2: float,
    beta1: float,
    beta2: float,
    blade_count: int,
    n_span: int = 5,
    n_chord: int = 21,
) -> str:
    """Generate ANSYS BladeGen .curve blade geometry file.

    The .curve file contains (m', theta) coordinates for each span.
    m' = normalized meridional distance (0=LE, 1=TE).
    theta = accumulated blade wrap angle in degrees.

    Format::

        BEGIN SPAN <xi>
        <m_prime>  <theta_deg>
        ...
        END SPAN

    Args:
        d2: Outlet diameter [m].
        d1: Inlet diameter [m].
        b2: Outlet width [m] (unused; kept for API symmetry).
        beta1: Inlet blade angle [deg].
        beta2: Outlet blade angle [deg].
        blade_count: Number of blades (unused; kept for API symmetry).
        n_span: Number of spanwise sections.
        n_chord: Number of chordwise points per span.

    Returns:
        String content of the .curve file.
    """
    r1 = d1 / 2
    r2 = d2 / 2

    lines = ["# BladeGen Blade Curve File"]
    lines.append(f"# Generated by HPE | Nblades={blade_count}")
    lines.append("")

    for i_span in range(n_span):
        xi = i_span / max(n_span - 1, 1)
        lines.append(f"BEGIN SPAN {xi:.4f}")

        r_in = r1 * (0.30 + xi * 0.70)
        r_out = r2 * (0.85 + xi * 0.15)

        theta_acc = 0.0

        for i_chord in range(n_chord):
            t = i_chord / max(n_chord - 1, 1)
            beta_t = beta1 + t * (beta2 - beta1)
            r_t = r_in + t * (r_out - r_in)

            # Increment in wrap angle
            dm = 1.0 / max(n_chord - 1, 1)
            tan_b = math.tan(math.radians(beta_t))
            if r_t > 1e-6 and abs(tan_b) > 1e-6:
                dtheta = dm * (r_out - r_in) / (r_t * tan_b)
            else:
                dtheta = 0.0
            theta_acc += dtheta

            lines.append(f"  {t:.6f}  {math.degrees(theta_acc):.4f}")

        lines.append("END SPAN")
        lines.append("")

    return "\n".join(lines)
