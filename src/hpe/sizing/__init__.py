"""HPE Sizing — 1D Meanline preliminary dimensioning module.

Equivalent to ADT TURBOdesign Pre. Entry point for the user in HPE.
Given basic operating requirements (Q, H, RPM, machine type, fluid),
delivers a complete stage dimensioning in seconds.

Usage:
    from hpe.core.models import OperatingPoint
    from hpe.sizing import run_sizing

    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    result = run_sizing(op)
"""

from hpe.sizing.meanline import run_sizing

__all__ = ["run_sizing"]
