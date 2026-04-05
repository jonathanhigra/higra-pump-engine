"""API routes for ANSYS CFX and Fluent integration.

Provides endpoints to generate solver input files (CCL, journal, scheme)
and parse results from ANSYS CFX and Fluent simulations.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/cfd/ansys", tags=["ansys"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AnsysGenerateRequest(BaseModel):
    """Request body for CFX/Fluent case generation."""

    flow_rate: float = Field(..., gt=0, description="Flow rate [m3/s]")
    head: float = Field(..., gt=0, description="Design head [m]")
    rpm: float = Field(..., gt=0, description="Rotational speed [rpm]")
    fluid_density: float = Field(998.0, gt=0, description="Fluid density [kg/m3]")
    fluid_viscosity: float = Field(1.003e-3, gt=0, description="Dynamic viscosity [Pa.s]")
    max_iterations: int = Field(500, ge=1, description="Max solver iterations")
    single_passage: bool = Field(True, description="Single-passage periodic (True) or full 360-degree wheel (False)")
    roughness_um: float = Field(0.0, ge=0, description="Wall roughness [um]. 0 = smooth wall")


class AnsysCsvParseRequest(BaseModel):
    """Request body for CSV-based results parsing (performance summary, blade loading)."""

    csv_content: str = Field(..., min_length=1, description="Raw CSV content")


class AnsysPerformanceParseRequest(BaseModel):
    """Request body for performance CSV parsing with operating point context."""

    csv_content: str = Field(..., min_length=1, description="Raw CSV content from CFX-Post export")
    rpm: Optional[float] = Field(None, gt=0, description="RPM for derived metrics")
    flow_rate: Optional[float] = Field(None, gt=0, description="Flow rate [m3/s]")
    fluid_density: float = Field(998.0, gt=0, description="Fluid density [kg/m3]")


class AnsysParseRequest(BaseModel):
    """Request body for results parsing."""

    monitor_data: str = Field(..., min_length=1, description="Raw monitor/report CSV content")
    rpm: Optional[float] = Field(None, gt=0, description="RPM (required for Fluent performance)")


class FluentXYParseRequest(BaseModel):
    """Request body for Fluent XY plot parsing."""

    plot_data: str = Field(..., min_length=1, description="Raw XY plot data")


class TemplateInfo(BaseModel):
    """Template listing entry."""

    name: str
    description: str
    solver: str
    machine_type: str


# ---------------------------------------------------------------------------
# Available templates
# ---------------------------------------------------------------------------

_TEMPLATES: list[dict[str, str]] = [
    {
        "name": "pump_steady",
        "description": "Steady-state centrifugal pump (MRF, SST turbulence)",
        "solver": "cfx,fluent",
        "machine_type": "centrifugal_pump",
    },
    {
        "name": "turbine_steady",
        "description": "Steady-state Francis turbine (MRF, SST turbulence)",
        "solver": "cfx,fluent",
        "machine_type": "francis_turbine",
    },
    {
        "name": "compressor_steady",
        "description": "Steady-state centrifugal compressor (MRF, SST turbulence)",
        "solver": "cfx,fluent",
        "machine_type": "centrifugal_compressor",
    },
]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/cfx/generate")
def generate_cfx(req: AnsysGenerateRequest) -> dict[str, Any]:
    """Generate ANSYS CFX input files from operating point.

    Runs meanline sizing internally and produces CCL content,
    TurboGrid setup parameters, and CFX-Post session template.

    Supports single-passage (periodic) or full-wheel (360 deg) domain
    via the ``single_passage`` flag, and wall roughness via ``roughness_um``.
    """
    from hpe.core.enums import MachineType
    from hpe.core.models import OperatingPoint
    from hpe.sizing import run_sizing
    from hpe.cfd.ansys_cfx.case_builder import CFXCaseBuilder

    op = OperatingPoint(
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        machine_type=MachineType.CENTRIFUGAL_PUMP,
        fluid_density=req.fluid_density,
        fluid_viscosity=req.fluid_viscosity,
    )
    sizing = run_sizing(op)

    builder = CFXCaseBuilder()
    ccl = builder.generate_ccl(
        sizing_result=sizing,
        rpm=req.rpm,
        flow_rate=req.flow_rate,
        fluid_density=req.fluid_density,
        single_passage=req.single_passage,
        roughness_um=req.roughness_um,
    )
    turbo_setup = builder.generate_turbo_setup(sizing)
    post_template = builder.generate_post_template(
        sizing_result=sizing,
        rpm=req.rpm,
        flow_rate=req.flow_rate,
        fluid_density=req.fluid_density,
    )

    return {
        "ccl": ccl,
        "turbo_setup": turbo_setup,
        "post_template": post_template,
    }


@router.post("/fluent/generate")
def generate_fluent(req: AnsysGenerateRequest) -> dict[str, Any]:
    """Generate ANSYS Fluent input files from operating point.

    Runs meanline sizing internally and produces journal (.jou)
    and scheme (.scm) file content.
    """
    from hpe.core.enums import MachineType
    from hpe.core.models import OperatingPoint
    from hpe.sizing import run_sizing
    from hpe.cfd.ansys_fluent.case_builder import FluentCaseBuilder

    op = OperatingPoint(
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        machine_type=MachineType.CENTRIFUGAL_PUMP,
        fluid_density=req.fluid_density,
        fluid_viscosity=req.fluid_viscosity,
    )
    sizing = run_sizing(op)

    builder = FluentCaseBuilder()
    journal = builder.generate_journal(
        sizing_result=sizing,
        rpm=req.rpm,
        flow_rate=req.flow_rate,
        fluid_density=req.fluid_density,
        fluid_viscosity=req.fluid_viscosity,
        max_iterations=req.max_iterations,
    )
    scheme = builder.generate_scheme(
        sizing_result=sizing,
        rpm=req.rpm,
        fluid_density=req.fluid_density,
    )

    return {
        "journal": journal,
        "scheme": scheme,
    }


@router.post("/cfx/parse")
def parse_cfx_results(req: AnsysParseRequest) -> dict[str, Any]:
    """Parse ANSYS CFX monitor CSV data and compute performance.

    Accepts raw CSV content from CFX monitor exports and returns
    parsed data with computed head, efficiency, and power.
    """
    from hpe.cfd.ansys_cfx.results_parser import CFXResultsParser

    parser = CFXResultsParser()
    parsed = parser.parse_monitor_csv(req.monitor_data)
    performance = parser.compute_performance(
        parsed,
        rpm=req.rpm,
    )

    return {
        "parsed": parsed,
        "performance": performance,
    }


@router.post("/cfx/parse_performance")
def parse_cfx_performance(req: AnsysPerformanceParseRequest) -> dict[str, Any]:
    """Parse CFX-Post performance_summary.csv export.

    Accepts raw CSV content from the post-processing template's
    Performance Summary table export.
    """
    from hpe.cfd.ansys_cfx.results_parser import CFXResultsParser

    parser = CFXResultsParser()
    summary = parser.parse_performance_summary(req.csv_content)

    return {
        "performance": summary,
    }


@router.post("/cfx/parse_blade_loading")
def parse_cfx_blade_loading(req: AnsysCsvParseRequest) -> dict[str, Any]:
    """Parse CFX-Post blade loading CSV export.

    Accepts raw CSV content from the post-processing template's
    Blade Loading Data table export. Returns streamwise coordinate
    and pressure/suction side pressure arrays.
    """
    from hpe.cfd.ansys_cfx.results_parser import CFXResultsParser

    parser = CFXResultsParser()
    blade_loading = parser.parse_blade_loading(req.csv_content)

    if not blade_loading["streamwise"]:
        raise HTTPException(
            status_code=422,
            detail="No valid blade loading data found in CSV content.",
        )

    return {
        "blade_loading": blade_loading,
        "n_points": len(blade_loading["streamwise"]),
    }


@router.post("/fluent/parse")
def parse_fluent_results(req: AnsysParseRequest) -> dict[str, Any]:
    """Parse ANSYS Fluent report data and compute performance.

    Accepts raw report content from Fluent and returns parsed data
    with computed head, efficiency, and power.  RPM is required
    for shaft power calculation.
    """
    from hpe.cfd.ansys_fluent.results_parser import FluentResultsParser

    if req.rpm is None:
        raise HTTPException(
            status_code=422,
            detail="RPM is required for Fluent performance calculation.",
        )

    parser = FluentResultsParser()
    parsed = parser.parse_report(req.monitor_data)
    performance = parser.compute_performance(parsed, rpm=req.rpm)

    return {
        "parsed": parsed,
        "performance": performance,
    }


@router.post("/cfx/package")
def download_cfx_package(req: AnsysGenerateRequest) -> Response:
    """Build and return a ZIP file with all ANSYS CFX files.

    The ZIP contains CCL setup, PCF parameters, blade .geo geometry,
    TurboGrid automation scripts, and a README with workflow instructions.
    """
    from hpe.core.enums import MachineType
    from hpe.core.models import OperatingPoint
    from hpe.sizing import run_sizing
    from hpe.cfd.cfx_package import build_cfx_package

    op = OperatingPoint(
        flow_rate=req.flow_rate,
        head=req.head,
        rpm=req.rpm,
        machine_type=MachineType.CENTRIFUGAL_PUMP,
        fluid_density=req.fluid_density,
        fluid_viscosity=req.fluid_viscosity,
    )
    sizing = run_sizing(op)
    zip_bytes = build_cfx_package(sizing, op)

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=cfx_package.zip",
        },
    )


@router.post("/cfx/validate-geo")
def validate_geo(body: dict[str, Any]) -> dict[str, Any]:
    """Validate .geo file content for TurboGrid compatibility.

    Accepts { "geo_content": "<raw .geo text>" } and returns
    validation results with issues and warnings.
    """
    from hpe.cfd.geo_validator import validate_geo_for_turbogrid

    geo_content = body.get("geo_content", "")
    if not geo_content:
        raise HTTPException(status_code=422, detail="geo_content is required.")
    return validate_geo_for_turbogrid(geo_content)


@router.get("/templates")
def list_templates() -> list[dict[str, str]]:
    """List available ANSYS simulation templates.

    Returns pre-configured templates for common turbomachinery
    simulation setups (pump, turbine, compressor).
    """
    return _TEMPLATES
