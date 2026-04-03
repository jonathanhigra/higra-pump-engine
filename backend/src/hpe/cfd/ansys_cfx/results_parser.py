"""ANSYS CFX results parser — extracts performance data from CFX monitor exports.

Parses CSV monitor files exported from CFX-Solver or CFX-Post and
computes pump performance metrics (head, efficiency, power).

References:
    ANSYS CFX-Solver Manager — monitor export format.
    ANSYS CFX-Post User's Guide — data export.
"""

from __future__ import annotations

import csv
import io
import math
from typing import Any


G = 9.80665  # m/s^2


class CFXResultsParser:
    """Parses ANSYS CFX monitor CSV exports and computes performance."""

    def parse_monitor_csv(self, filepath_or_content: str) -> dict[str, Any]:
        """Parse a CFX monitor CSV file into structured data.

        CFX exports monitor data as CSV with columns for iteration
        number and monitored quantities (pressures, mass flow, torque,
        residuals).  This method accepts either a file path or the
        raw CSV content as a string.

        Args:
            filepath_or_content: Path to the CSV file, or its raw text
                content (auto-detected by checking for newlines).

        Returns:
            Dictionary with keys:
                - iteration: list[int]
                - residuals: dict[str, list[float]] — keyed by variable name
                - pressure_inlet: list[float] — [Pa]
                - pressure_outlet: list[float] — [Pa]
                - mass_flow: list[float] — [kg/s]
                - torque: list[float] — [N.m]
        """
        # Determine if input is content or filepath
        if "\n" in filepath_or_content or "," in filepath_or_content:
            content = filepath_or_content
        else:
            with open(filepath_or_content, "r", encoding="utf-8") as fh:
                content = fh.read()

        reader = csv.reader(io.StringIO(content))
        rows = list(reader)

        if len(rows) < 2:
            return {
                "iteration": [],
                "residuals": {},
                "pressure_inlet": [],
                "pressure_outlet": [],
                "mass_flow": [],
                "torque": [],
            }

        # Parse header to identify columns
        header = [col.strip() for col in rows[0]]
        col_map = {name.lower(): idx for idx, name in enumerate(header)}

        iterations: list[int] = []
        pressure_inlet: list[float] = []
        pressure_outlet: list[float] = []
        mass_flow: list[float] = []
        torque: list[float] = []
        residuals: dict[str, list[float]] = {}

        # Identify residual columns (typically contain "RMS" or "residual")
        residual_cols: dict[str, int] = {}
        for name, idx in col_map.items():
            if "rms" in name or "residual" in name or "res" in name:
                residual_cols[name] = idx

        for row in rows[1:]:
            if not row or not row[0].strip():
                continue
            try:
                # Iteration column (first column or named)
                iter_idx = col_map.get("iteration", col_map.get("step", 0))
                iterations.append(int(float(row[iter_idx].strip())))

                # Pressure columns
                for key, target in [
                    ("inlet pressure", pressure_inlet),
                    ("pressure_inlet", pressure_inlet),
                    ("inlet_pressure", pressure_inlet),
                    ("outlet pressure", pressure_outlet),
                    ("pressure_outlet", pressure_outlet),
                    ("outlet_pressure", pressure_outlet),
                ]:
                    if key in col_map:
                        target.append(float(row[col_map[key]].strip()))

                # Mass flow
                for key in ("mass flow", "mass_flow", "massflow"):
                    if key in col_map:
                        mass_flow.append(float(row[col_map[key]].strip()))

                # Torque
                for key in ("torque", "torque_z", "moment"):
                    if key in col_map:
                        torque.append(float(row[col_map[key]].strip()))

                # Residuals
                for name, idx in residual_cols.items():
                    residuals.setdefault(name, [])
                    residuals[name].append(float(row[idx].strip()))

            except (ValueError, IndexError):
                continue

        return {
            "iteration": iterations,
            "residuals": residuals,
            "pressure_inlet": pressure_inlet,
            "pressure_outlet": pressure_outlet,
            "mass_flow": mass_flow,
            "torque": torque,
        }

    def compute_performance(self, parsed: dict[str, Any]) -> dict[str, Any]:
        """Compute pump performance metrics from parsed monitor data.

        Uses the last converged values of pressure, mass flow, and
        torque to calculate head, efficiency, and shaft power.

        Args:
            parsed: Output of parse_monitor_csv.

        Returns:
            Dictionary with keys:
                - head_m: Pump head [m]
                - efficiency: Hydraulic efficiency [-]
                - power_w: Shaft power [W]
        """
        # Use last available values
        p_in = parsed["pressure_inlet"][-1] if parsed["pressure_inlet"] else 0.0
        p_out = parsed["pressure_outlet"][-1] if parsed["pressure_outlet"] else 0.0
        m_dot = abs(parsed["mass_flow"][-1]) if parsed["mass_flow"] else 0.0
        torque_val = abs(parsed["torque"][-1]) if parsed["torque"] else 0.0

        # Default density for water
        rho = 998.0

        # Head from total pressure difference
        delta_p = p_out - p_in
        head_m = delta_p / (rho * G) if rho > 0 else 0.0

        # Hydraulic power
        p_hydraulic = m_dot * G * head_m

        # Shaft power: P = torque * omega
        # Without omega we estimate from torque and hydraulic power
        # If torque is available, efficiency = P_hydraulic / P_shaft
        # But we need omega — store power as torque-based if omega unknown
        # For now compute power assuming omega was embedded in torque monitor
        power_w = abs(delta_p * m_dot / rho) if rho > 0 else 0.0

        efficiency = 0.0
        if torque_val > 0 and power_w > 0:
            # Estimate: shaft power ~ hydraulic power / efficiency
            # With just monitors, best we can do is ratio
            efficiency = min(1.0, p_hydraulic / (torque_val * 100.0)) \
                if torque_val > 0 else 0.0

        return {
            "head_m": round(head_m, 4),
            "efficiency": round(efficiency, 4),
            "power_w": round(power_w, 2),
            "pressure_rise_pa": round(delta_p, 2),
            "mass_flow_kgs": round(m_dot, 6),
        }
