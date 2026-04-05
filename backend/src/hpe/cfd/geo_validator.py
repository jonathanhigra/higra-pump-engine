"""Validator for .geo files targeting ANSYS TurboGrid compatibility.

Checks structure, header, coordinate ranges, and data integrity of
.geo blade geometry files before they are imported into TurboGrid.

References:
    ANSYS TurboGrid User's Guide -- Geometry file format.
"""

from __future__ import annotations

import math


def validate_geo_for_turbogrid(geo_content: str) -> dict:
    """Validate .geo file content for TurboGrid compatibility.

    Checks:
        - Header line with n_sections and n_points_per_section.
        - Correct total number of coordinate lines.
        - Coordinates in mm (warns if values look like metres).
        - No NaN or Inf values.
        - Section ordering: hub (small r) to shroud (large r).
        - Point ordering within each section: LE to TE (increasing theta).
        - Positive radius values.

    Args:
        geo_content: Raw string content of a .geo file.

    Returns:
        Dict with keys:
            valid (bool): True if no blocking issues found.
            issues (list[str]): Blocking problems.
            warnings (list[str]): Non-blocking concerns.
            n_sections (int): Parsed section count.
            n_points_per_section (int): Parsed point count per section.
    """
    issues: list[str] = []
    warnings: list[str] = []
    n_sections = 0
    n_pts = 0

    lines = geo_content.strip().split("\n")
    if not lines:
        issues.append("File is empty.")
        return {
            "valid": False,
            "issues": issues,
            "warnings": warnings,
            "n_sections": 0,
            "n_points_per_section": 0,
        }

    # --- Parse header ---------------------------------------------------
    header = lines[0].strip().split()
    if len(header) < 2:
        issues.append(
            f"Header must contain n_sections and n_points_per_section, "
            f"got: '{lines[0].strip()}'."
        )
        return {
            "valid": False,
            "issues": issues,
            "warnings": warnings,
            "n_sections": 0,
            "n_points_per_section": 0,
        }

    try:
        n_sections = int(header[0])
        n_pts = int(header[1])
    except ValueError:
        issues.append(
            f"Cannot parse header integers from '{lines[0].strip()}'."
        )
        return {
            "valid": False,
            "issues": issues,
            "warnings": warnings,
            "n_sections": 0,
            "n_points_per_section": 0,
        }

    if n_sections < 2:
        issues.append(f"n_sections should be >= 2 (hub + shroud), got {n_sections}.")
    if n_pts < 3:
        issues.append(f"n_points_per_section should be >= 3, got {n_pts}.")

    expected_data_lines = n_sections * n_pts
    data_lines = lines[1:]
    actual_data_lines = len(data_lines)

    if actual_data_lines != expected_data_lines:
        issues.append(
            f"Expected {expected_data_lines} data lines "
            f"({n_sections} sections x {n_pts} points), "
            f"got {actual_data_lines}."
        )

    # --- Parse coordinate data ------------------------------------------
    sections: list[list[tuple[float, float, float]]] = []
    current_section: list[tuple[float, float, float]] = []

    for idx, line in enumerate(data_lines):
        parts = line.strip().split()
        if len(parts) != 3:
            issues.append(f"Line {idx + 2}: expected 3 values (X R theta), got {len(parts)}.")
            continue

        try:
            x_val = float(parts[0])
            r_val = float(parts[1])
            theta_val = float(parts[2])
        except ValueError:
            issues.append(f"Line {idx + 2}: cannot parse floats from '{line.strip()}'.")
            continue

        # Check for NaN / Inf
        for name, val in [("X", x_val), ("R", r_val), ("theta", theta_val)]:
            if math.isnan(val) or math.isinf(val):
                issues.append(f"Line {idx + 2}: {name} is {val}.")

        # Negative radius
        if r_val < 0:
            issues.append(f"Line {idx + 2}: negative radius R = {r_val}.")

        current_section.append((x_val, r_val, theta_val))

        if len(current_section) == n_pts:
            sections.append(current_section)
            current_section = []

    # Remaining partial section
    if current_section:
        warnings.append(
            f"Trailing {len(current_section)} points do not form a complete section."
        )

    # --- Unit check: if max R < 1.0, probably in metres not mm ----------
    all_r = [pt[1] for sec in sections for pt in sec]
    if all_r:
        max_r = max(all_r)
        if max_r < 1.0:
            warnings.append(
                f"Max radius = {max_r:.6f} — values appear to be in metres. "
                "TurboGrid typically expects mm."
            )

    # --- Section ordering: hub (smaller r) to shroud (larger r) ---------
    if len(sections) >= 2:
        avg_r_first = sum(pt[1] for pt in sections[0]) / max(len(sections[0]), 1)
        avg_r_last = sum(pt[1] for pt in sections[-1]) / max(len(sections[-1]), 1)
        if avg_r_first > avg_r_last:
            warnings.append(
                "First section has larger average R than last section. "
                "Expected hub (smaller R) first, shroud (larger R) last."
            )

    # --- Point ordering: LE to TE (increasing theta) --------------------
    for s_idx, sec in enumerate(sections):
        if len(sec) < 2:
            continue
        theta_vals = [pt[2] for pt in sec]
        non_decreasing = all(
            theta_vals[i] <= theta_vals[i + 1] + 1e-9
            for i in range(len(theta_vals) - 1)
        )
        if not non_decreasing:
            warnings.append(
                f"Section {s_idx + 1}: theta is not monotonically increasing "
                "(expected LE to TE ordering)."
            )

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "warnings": warnings,
        "n_sections": n_sections,
        "n_points_per_section": n_pts,
    }
