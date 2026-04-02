"""I/O routes — import/export of turbomachinery design file formats."""
from __future__ import annotations

import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse

from hpe.io.ptd_reader import parse_ptd, ptd_to_operating_point

router = APIRouter(prefix="/api/v1/io", tags=["io"])


@router.post("/import_ptd")
async def import_ptd(file: UploadFile = File(...)) -> dict:
    """Import a TURBOdesignPre .ptd file and extract operating point."""
    with tempfile.NamedTemporaryFile(suffix=".ptd", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        params = parse_ptd(tmp_path)
        op = ptd_to_operating_point(params)
        return {
            "operating_point": op,
            "raw_params": {k: v for k, v in list(params.items())[:50]},
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PTD: {e}")
    finally:
        os.unlink(tmp_path)


@router.get("/td1_perfdata")
async def td1_perfdata_export(
    flow_rate: float,
    head: float,
    rpm_vector: str = "800,1000,1200,1450,1750",
    project_name: str = "HPE_Design",
) -> PlainTextResponse:
    """Run a parametric speed sweep and return a TD1PerfData.dat file.

    Equivalent to exporting ANSYS BladeGen / TurboGrid performance data.
    """
    import asyncio

    from hpe.core.models import OperatingPoint
    from hpe.io.td1_perfdata import generate_td1_perfdata
    from hpe.sizing.meanline import run_sizing

    speeds = [float(n.strip()) for n in rpm_vector.split(",") if n.strip()]

    def _size(n_rpm: float) -> dict:
        op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=n_rpm)
        result = run_sizing(op)
        return {
            "flow_rate": flow_rate,
            "head": head,
            "rpm": n_rpm,
            "estimated_efficiency": result.estimated_efficiency,
            "estimated_npsh_r": result.estimated_npsh_r,
            "estimated_power": result.estimated_power,
            "specific_speed_nq": result.specific_speed_nq,
            "impeller_d2": result.impeller_d2,
            "blade_count": result.blade_count,
        }

    loop = asyncio.get_event_loop()
    results = await asyncio.gather(*[loop.run_in_executor(None, _size, n) for n in speeds])

    content = generate_td1_perfdata(list(results), project_name=project_name)
    return PlainTextResponse(content=content, media_type="text/plain")
