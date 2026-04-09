"""API routes expondo as Fases 17-20 (paridade Ansys CFD).

Todas as rotas montadas sob ``/api/v1/cfd/advanced/*`` e seguem o
padrão: aceitar operating point + config, retornar resumo JSON com
caminhos dos arquivos gerados.

Endpoints:
  POST /cfd/advanced/multi_domain      — rotor+voluta AMI
  POST /cfd/advanced/cavitation_case   — caso ZGB
  POST /cfd/advanced/prism_layers      — calcular config prism
  POST /cfd/advanced/spanwise          — loading hub/mid/tip
  POST /cfd/advanced/vtk_export        — export campo CFD
  POST /cfd/advanced/q_criterion       — Q-criterion
  POST /cfd/advanced/loss_audit        — auditoria de perdas
  POST /cfd/advanced/turbo_views       — meridional + blade2blade
  POST /cfd/advanced/transient         — caso pimpleFoam transiente
  POST /cfd/advanced/pulsations        — análise FFT BPF
  POST /cfd/advanced/radial_forces     — forças Stepanoff Kr
  POST /cfd/advanced/transition        — ativar γ-Reθ
  POST /cfd/advanced/morph             — mesh morphing
  POST /cfd/advanced/multi_stage       — bomba N estágios
  GET  /cfd/advanced/benchmarks        — lista benchmarks
  POST /cfd/advanced/benchmarks/run    — validar contra benchmarks
  POST /cfd/advanced/report            — gerar PDF/HTML/MD report
"""

from __future__ import annotations

import logging
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/cfd/advanced", tags=["cfd-advanced"])


# ---------------------------------------------------------------------------
# Common request model
# ---------------------------------------------------------------------------

class OpPoint(BaseModel):
    flow_rate: float = Field(..., gt=0, description="Q [m³/s]")
    head: float = Field(..., gt=0, description="H [m]")
    rpm: float = Field(..., gt=0)


def _sizing_from_op(op: OpPoint):
    """Helper: executa sizing 1D a partir do OpPoint."""
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing
    opm = OperatingPoint(flow_rate=op.flow_rate, head=op.head, rpm=op.rpm)
    return run_sizing(opm)


def _tmp_dir(prefix: str) -> Path:
    p = Path(tempfile.gettempdir()) / f"hpe_{prefix}_{uuid.uuid4().hex[:8]}"
    p.mkdir(parents=True, exist_ok=True)
    return p


# ===========================================================================
# Fase 17 endpoints
# ===========================================================================

class MultiDomainRequest(OpPoint):
    turbulence_model: str = "kOmegaSST"
    n_procs: int = 4


@router.post("/multi_domain", summary="Montar caso multi-domínio rotor+voluta AMI")
def multi_domain(req: MultiDomainRequest) -> dict[str, Any]:
    from hpe.cfd.openfoam.multi_domain import build_multi_domain_case
    sizing = _sizing_from_op(req)
    work = _tmp_dir("multidom")
    case = build_multi_domain_case(
        sizing=sizing, output_dir=work,
        turbulence_model=req.turbulence_model, n_procs=req.n_procs,
    )
    return case.to_dict()


class CavitationCaseRequest(OpPoint):
    temperature_c: float = 20.0
    npsh_available: float = 5.0
    n_procs: int = 4


@router.post("/cavitation_case", summary="Caso cavitação CFD Zwart-Gerber-Belamri")
def cavitation_case(req: CavitationCaseRequest) -> dict[str, Any]:
    from hpe.cfd.openfoam.cavitation_case import build_cavitation_case, ZGBConfig
    sizing = _sizing_from_op(req)
    cfg = ZGBConfig.water_at(req.temperature_c)
    work = _tmp_dir("cav")
    case = build_cavitation_case(
        sizing=sizing, output_dir=work, config=cfg,
        npsh_available=req.npsh_available, n_procs=req.n_procs,
    )
    return case.to_dict()


class PrismLayersRequest(BaseModel):
    u_ref: float = Field(..., gt=0)
    l_ref: float = Field(..., gt=0)
    nu: float = 1e-6
    target_yplus: float = 1.0
    expansion_ratio: float = 1.2
    turbulence_model: str = "kOmegaSST"


@router.post("/prism_layers", summary="Calcular prism layer config com y+ targeting")
def prism_layers(req: PrismLayersRequest) -> dict[str, Any]:
    from hpe.cfd.mesh.prism_layers import compute_prism_layer_config, yplus_target_for_model
    target = req.target_yplus or yplus_target_for_model(req.turbulence_model)
    cfg = compute_prism_layer_config(
        u_ref=req.u_ref, l_ref=req.l_ref, nu=req.nu,
        target_yplus=target, expansion_ratio=req.expansion_ratio,
    )
    return cfg.to_dict()


class SpanwiseRequest(OpPoint):
    spans: list[float] = Field(default=[0.1, 0.5, 0.9])
    n_chord: int = 21
    case_dir: Optional[str] = None


@router.post("/spanwise", summary="Spanwise blade loading (hub/mid/tip)")
def spanwise(req: SpanwiseRequest) -> dict[str, Any]:
    from hpe.cfd.results.spanwise_loading import extract_spanwise_loading
    from hpe.core.models import OperatingPoint
    op = OperatingPoint(flow_rate=req.flow_rate, head=req.head, rpm=req.rpm)
    case = Path(req.case_dir) if req.case_dir else _tmp_dir("span")
    result = extract_spanwise_loading(case, op, spans=req.spans, n_chord=req.n_chord)
    return result.to_dict()


# ===========================================================================
# Fase 18 endpoints
# ===========================================================================

class VtkExportRequest(BaseModel):
    case_dir: str = Field(..., description="Diretório caso OpenFOAM")
    fields: list[str] = Field(default=["U", "p"])
    time: Optional[str] = None


@router.post("/vtk_export", summary="Export campos CFD → VTU + JSON sampled")
def vtk_export(req: VtkExportRequest) -> dict[str, Any]:
    from hpe.cfd.postprocessing.vtk_export import export_field
    result = export_field(req.case_dir, fields=req.fields, time=req.time)
    return result.to_dict()


class FieldFeaturesRequest(BaseModel):
    case_dir: str
    field_name: str = "U"
    n_seeds: int = 20


@router.post("/q_criterion", summary="Q-criterion + vortex identification")
def q_criterion(req: FieldFeaturesRequest) -> dict[str, Any]:
    import json
    from hpe.cfd.postprocessing.vtk_export import export_field
    from hpe.cfd.postprocessing.field_features import compute_q_criterion, compute_streamlines

    exp = export_field(req.case_dir, fields=[req.field_name, "p"])
    if not exp.json_path or not exp.json_path.exists():
        raise HTTPException(status_code=503, detail="Field export failed")

    data = json.loads(exp.json_path.read_text())
    q = compute_q_criterion(data)
    sl = compute_streamlines(data, n_seeds=req.n_seeds)
    return {
        "q_criterion": q.to_dict(),
        "streamlines_count": sl.n_lines,
    }


class LossAuditRequest(OpPoint):
    case_dir: Optional[str] = None
    fluid_density: float = 998.2
    fluid_temp_K: float = 293.15


@router.post("/loss_audit", summary="Loss audit via entropy generation (Kock/Denton)")
def loss_audit(req: LossAuditRequest) -> dict[str, Any]:
    from hpe.cfd.postprocessing.loss_audit import audit_losses_from_cfd
    sizing = _sizing_from_op(req)
    case = Path(req.case_dir) if req.case_dir else _tmp_dir("loss")
    audit = audit_losses_from_cfd(
        case, sizing,
        fluid_density=req.fluid_density, fluid_temp_K=req.fluid_temp_K,
    )
    return audit.to_dict()


class TurboViewsRequest(BaseModel):
    case_dir: str
    field_name: str = "U"
    r_slice: Optional[float] = None


@router.post("/turbo_views", summary="Meridional avg + blade-to-blade views")
def turbo_views(req: TurboViewsRequest) -> dict[str, Any]:
    import json
    from hpe.cfd.postprocessing.vtk_export import export_field
    from hpe.cfd.postprocessing.turbo_views import (
        extract_meridional_average, extract_blade_to_blade,
    )

    exp = export_field(req.case_dir, fields=[req.field_name])
    if not exp.json_path or not exp.json_path.exists():
        raise HTTPException(status_code=503, detail="Field export failed")
    data = json.loads(exp.json_path.read_text())
    mer = extract_meridional_average(data, req.field_name)
    b2b = extract_blade_to_blade(data, req.field_name, r_slice=req.r_slice)
    return {
        "meridional": {
            "n_r": mer.n_r, "n_z": mer.n_z,
            "min": mer.min_value, "max": mer.max_value,
        },
        "blade_to_blade": {
            "r_slice": b2b.r_slice,
            "min": b2b.min_value, "max": b2b.max_value,
        },
    }


# ===========================================================================
# Fase 19 endpoints
# ===========================================================================

class TransientRequest(OpPoint):
    end_time: float = 0.2
    write_interval: float = 0.002
    max_co: float = 2.0
    n_procs: int = 4


@router.post("/transient", summary="Montar caso transiente pimpleFoam sliding mesh")
def transient(req: TransientRequest) -> dict[str, Any]:
    from hpe.cfd.openfoam.transient import build_transient_case, TransientConfig
    sizing = _sizing_from_op(req)
    cfg = TransientConfig(
        end_time=req.end_time, write_interval=req.write_interval, max_co=req.max_co,
    )
    work = _tmp_dir("trans")
    case = build_transient_case(sizing, work, cfg, n_procs=req.n_procs)
    return case.to_dict()


class PulsationsRequest(BaseModel):
    case_dir: Optional[str] = None
    rpm: float = Field(..., gt=0)
    blade_count: int = Field(..., ge=2)
    field_name: str = "p"


@router.post("/pulsations", summary="FFT de probes + BPF spectrum")
def pulsations(req: PulsationsRequest) -> dict[str, Any]:
    from hpe.cfd.postprocessing.pulsations import analyze_probes
    case = Path(req.case_dir) if req.case_dir else _tmp_dir("puls")
    result = analyze_probes(case, rpm=req.rpm, blade_count=req.blade_count, field_name=req.field_name)
    return result.to_dict()


class RadialForcesRequest(OpPoint):
    case_dir: Optional[str] = None
    fluid_density: float = 998.2


@router.post("/radial_forces", summary="Forças radiais Stepanoff Kr + FFT")
def radial_forces(req: RadialForcesRequest) -> dict[str, Any]:
    from hpe.cfd.postprocessing.radial_forces import analyze_radial_forces
    sizing = _sizing_from_op(req)
    case = Path(req.case_dir) if req.case_dir else _tmp_dir("rf")
    result = analyze_radial_forces(case, sizing, fluid_density=req.fluid_density)
    return result.to_dict()


class TransitionRequest(BaseModel):
    case_dir: str
    u_ref: float = 10.0
    turbulence_intensity: float = 0.05


@router.post("/transition", summary="Ativar modelo transição γ-Reθ (kOmegaSSTLM)")
def transition(req: TransitionRequest) -> dict[str, Any]:
    from hpe.cfd.openfoam.transition_model import enable_transition_for_case
    case_dir = Path(req.case_dir)
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"case_dir not found: {case_dir}")
    return enable_transition_for_case(
        case_dir, u_ref=req.u_ref, turbulence_intensity=req.turbulence_intensity,
    )


# ===========================================================================
# Fase 20 endpoints
# ===========================================================================

class MorphRequest(OpPoint):
    case_dir: str
    design_deltas: dict[str, float]


@router.post("/morph", summary="Mesh morphing displacementLaplacian")
def morph(req: MorphRequest) -> dict[str, Any]:
    from hpe.cfd.openfoam.morph import morph_mesh, MorphConfig
    sizing = _sizing_from_op(req)
    result = morph_mesh(
        case_dir=req.case_dir, design_deltas=req.design_deltas,
        sizing=sizing, config=MorphConfig(),
    )
    return result.to_dict()


class MultiStageRequest(BaseModel):
    flow_rate: float = Field(..., gt=0)
    head_per_stage: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    n_stages: int = Field(..., ge=1, le=20)
    turbulence_model: str = "kOmegaSST"


@router.post("/multi_stage", summary="Montar caso multi-estágio com mixing planes")
def multi_stage(req: MultiStageRequest) -> dict[str, Any]:
    from hpe.cfd.openfoam.multi_stage import build_multistage_case, StageConfig
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    # Cada estágio tem o mesmo Q mas head_per_stage
    stages = []
    for i in range(req.n_stages):
        opm = OperatingPoint(flow_rate=req.flow_rate, head=req.head_per_stage, rpm=req.rpm)
        s = run_sizing(opm)
        stages.append(StageConfig(sizing=s, stage_id=i))

    work = _tmp_dir("mstg")
    case = build_multistage_case(stages, work, turbulence_model=req.turbulence_model)
    return case.to_dict()


@router.get("/benchmarks", summary="Listar benchmarks de validação")
def list_benchmarks_endpoint() -> dict[str, Any]:
    from hpe.validation.benchmarks import list_benchmarks
    return {"benchmarks": [b.to_dict() for b in list_benchmarks()]}


class BenchmarkRunRequest(BaseModel):
    method: str = Field("meanline", description="meanline | surrogate")


@router.post("/benchmarks/run", summary="Validar HPE contra todos os benchmarks")
def run_benchmarks(req: BenchmarkRunRequest) -> dict[str, Any]:
    from hpe.validation.benchmarks import run_all_benchmarks
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    def _meanline_curve_builder(Q_bep: float, H_bep: float, rpm: float):
        """Constrói callables de curva H(Q), η(Q), P(Q) via meanline."""
        op = OperatingPoint(flow_rate=Q_bep, head=H_bep, rpm=rpm)
        sizing = run_sizing(op)
        eta_bep = float(getattr(sizing, "estimated_efficiency", 0.80))

        def head_fn(Q: float) -> float:
            # Parábola Gülich: H ≈ H_bep × (1.25 − 0.05·f − 0.20·f²)
            f = Q / Q_bep if Q_bep > 0 else 1.0
            return H_bep * max(0.3, 1.25 - 0.05 * f - 0.20 * f * f)

        def eta_fn(Q: float) -> float:
            f = Q / Q_bep if Q_bep > 0 else 1.0
            return eta_bep * (1 - 0.6 * (f - 1) ** 2)

        def power_fn(Q: float) -> float:
            rho, g = 998.2, 9.81
            H = head_fn(Q)
            e = max(0.1, eta_fn(Q))
            return rho * g * Q * H / e

        return head_fn, eta_fn, power_fn

    results = run_all_benchmarks(_meanline_curve_builder)
    return {
        "n_benchmarks": len(results),
        "n_passed": sum(1 for r in results if r.passed),
        "results": [r.to_dict() for r in results],
    }


class ReportRequest(BaseModel):
    project_name: str = "HPE Pump Design Report"
    format: str = Field("auto", description="auto | pdf | html | markdown")
    sizing: Optional[dict] = None
    cavitation: Optional[dict] = None
    loss_audit: Optional[dict] = None
    radial_forces: Optional[dict] = None
    benchmark_results: Optional[list] = None
    warnings: list[str] = Field(default_factory=list)


@router.post("/report", summary="Gerar relatório técnico PDF/HTML/MD")
def report(req: ReportRequest):
    from hpe.reports.generator import generate_report, ReportContext

    ctx = ReportContext(
        project_name=req.project_name,
        sizing=req.sizing,
        cavitation=req.cavitation,
        loss_audit=req.loss_audit,
        radial_forces=req.radial_forces,
        benchmark_results=req.benchmark_results,
        warnings=req.warnings,
    )

    out_dir = _tmp_dir("report")
    out_file = out_dir / "report"
    final = generate_report(ctx, out_file, format=req.format)

    media_types = {
        ".pdf":  "application/pdf",
        ".html": "text/html",
        ".md":   "text/markdown",
    }
    mt = media_types.get(final.suffix, "application/octet-stream")
    return FileResponse(
        path=str(final),
        media_type=mt,
        filename=f"{req.project_name.replace(' ', '_')}{final.suffix}",
    )
