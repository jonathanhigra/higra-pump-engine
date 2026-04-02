"""HPE Python SDK — programmatic access to pump design pipeline.

Usage:
    from hpe.sdk import HPEClient

    client = HPEClient()
    result = client.size_pump(flow_rate=0.05, head=30, rpm=1750)
    curves = client.get_curves(flow_rate=0.05, head=30, rpm=1750)
    client.export_pdf("my_pump.pdf", result)
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any


@dataclass
class PumpDesign:
    """Complete pump design result from SDK."""
    operating_point: dict
    sizing: dict
    curves: list[dict] = None
    losses: dict = None
    stress: dict = None


class HPEClient:
    """HPE SDK client for programmatic pump design.

    Can operate in:
    - Local mode: Directly calls Python modules (no HTTP)
    - Remote mode: Makes HTTP calls to HPE API server

    Args:
        base_url: API base URL (None for local mode).
        token: Authentication token (for remote mode).
    """

    def __init__(self, base_url: str = None, token: str = ""):
        self.base_url = base_url
        self.token = token
        self._local = base_url is None

    def size_pump(
        self,
        flow_rate: float,       # m³/s
        head: float,            # m
        rpm: float,             # 1/min
        machine_type: str = "centrifugal_pump",
        **overrides,            # override_d2, override_b2, etc.
    ) -> dict:
        """Run 1D meanline sizing.

        Returns:
            SizingResult as dict.
        """
        if self._local:
            from hpe.core.models import OperatingPoint
            from hpe.sizing.meanline import run_sizing
            op = OperatingPoint(
                flow_rate=flow_rate, head=head, rpm=rpm,
                override_d2=overrides.get("override_d2"),
                override_b2=overrides.get("override_b2"),
                override_d1=overrides.get("override_d1"),
            )
            result = run_sizing(op)
            return _sizing_to_dict(result)
        else:
            return self._post("/api/v1/sizing", {
                "flow_rate": flow_rate, "head": head, "rpm": rpm,
                "machine_type": machine_type, **overrides,
            })

    def get_curves(
        self,
        flow_rate: float, head: float, rpm: float,
        n_points: int = 30,
    ) -> list[dict]:
        """Generate H-Q performance curves."""
        if self._local:
            from hpe.core.models import OperatingPoint
            from hpe.sizing.meanline import run_sizing
            from hpe.physics.curves import generate_curves
            op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
            sizing = run_sizing(op)
            curves = generate_curves(sizing, n_points=n_points)
            return [
                {"flow_m3h": curves.flow_rates[i]*3600, "head": curves.heads[i],
                 "efficiency": curves.efficiencies[i], "power": curves.powers[i]}
                for i in range(len(curves.flow_rates))
            ]
        else:
            return self._post("/api/v1/curves", {
                "flow_rate": flow_rate, "head": head, "rpm": rpm, "n_points": n_points,
            }).get("points", [])

    def multi_point_analysis(self, points: list[dict]) -> list[dict]:
        """Run sizing for multiple operating points.

        Args:
            points: List of dicts with flow_rate, head, rpm.

        Returns:
            List of sizing results.
        """
        if self._local:
            return [self.size_pump(**p) for p in points]
        else:
            return self._post("/api/v1/sizing/multi_point", {"points": points})["results"]

    def design_pump(
        self,
        flow_rate: float, head: float, rpm: float,
        include_curves: bool = True,
        include_losses: bool = False,
    ) -> PumpDesign:
        """Complete pump design with optional analysis modules."""
        sizing = self.size_pump(flow_rate, head, rpm)
        curves = self.get_curves(flow_rate, head, rpm) if include_curves else None
        return PumpDesign(
            operating_point={"flow_rate": flow_rate, "head": head, "rpm": rpm},
            sizing=sizing,
            curves=curves,
        )

    def _post(self, path: str, data: dict) -> Any:
        """Make HTTP POST request to API."""
        import urllib.request
        import json
        url = self.base_url.rstrip("/") + path
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())


def _sizing_to_dict(result) -> dict:
    """Convert SizingResult to dict."""
    import dataclasses
    if dataclasses.is_dataclass(result):
        d = {}
        for f in dataclasses.fields(result):
            v = getattr(result, f.name)
            if dataclasses.is_dataclass(v):
                d[f.name] = _sizing_to_dict(v)
            elif hasattr(v, 'as_dict'):
                d[f.name] = v.as_dict()
            elif hasattr(v, 'value'):  # Enum
                d[f.name] = v.value
            else:
                d[f.name] = v
        return d
    return result
