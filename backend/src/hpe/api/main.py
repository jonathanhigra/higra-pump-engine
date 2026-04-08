"""HPE FastAPI — main entry point (v2.0 clean interface).

Exposes the core HPE endpoints as specified in the HPE Development
Document v2.0:

  POST /sizing/run          1D meanline sizing
  POST /surrogate/predict   Surrogate model prediction
  GET  /surrogate/similar   Find similar designs in training_log
  GET  /health              Health check

The full application with all routes (geometry, CFD, optimisation, etc.)
is in hpe.api.app.  This module is a focused sub-app for the core
pipeline, suitable for standalone deployment or testing.

Usage
-----
    uvicorn hpe.api.main:app --host 0.0.0.0 --port 8000 --reload

    # Or run the full app:
    uvicorn hpe.api.app:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Higra Pump Engine API",
    description="AI-native turbomachinery design platform",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic schemas — v2.0 spec
# ---------------------------------------------------------------------------

class SizingInput(BaseModel):
    """Operating point specification for 1D sizing."""
    Q: float = Field(..., gt=0, description="Flow rate [m3/s]")
    H: float = Field(..., gt=0, description="Total head [m]")
    n: float = Field(..., gt=0, description="Rotational speed [rpm]")
    fluid: str = Field("water", description="Working fluid")
    rho: float = Field(998.0, gt=0, description="Fluid density [kg/m3]")
    nu: float = Field(1.004e-6, gt=0, description="Kinematic viscosity [m2/s]")


class SizingOutput(BaseModel):
    """1D sizing results."""
    Ns: float = Field(..., description="Specific speed (dimensional)")
    Nq: float = Field(..., description="Specific speed (European)")
    omega_s: float = Field(..., description="Dimensionless specific speed")
    D1: float = Field(..., description="Inlet diameter [m]")
    D2: float = Field(..., description="Outlet diameter [m]")
    b2: float = Field(..., description="Outlet width [m]")
    beta1: float = Field(..., description="Inlet blade angle [deg]")
    beta2: float = Field(..., description="Outlet blade angle [deg]")
    u2: float = Field(..., description="Tip speed [m/s]")
    eta_hid: float = Field(..., description="Hydraulic efficiency estimate")
    eta_total: float = Field(..., description="Total efficiency estimate")
    P_shaft: float = Field(..., description="Shaft power [kW]")
    NPSHr: float = Field(..., description="Required NPSH [m]")
    warnings: list[str] = Field(default_factory=list)
    computation_time_ms: float = 0.0


class SurrogatePredictInput(BaseModel):
    """Input for surrogate model prediction (v2.0 canonical interface)."""
    Ns: float = Field(..., gt=0, description="Specific speed n*sqrt(Q)/H^0.75")
    D2: float = Field(..., gt=0, description="Impeller diameter [mm]")
    b2: float = Field(..., gt=0, description="Outlet width [mm]")
    beta2: float = Field(..., gt=0, lt=90, description="Outlet blade angle [deg]")
    n: float = Field(..., gt=0, description="Rotational speed [rpm]")
    Q: float = Field(..., gt=0, description="Flow rate [m3/s]")
    H: float = Field(..., gt=0, description="Total head [m]")
    n_stages: int = Field(1, ge=1, description="Number of stages")


class SurrogatePredictOutput(BaseModel):
    """Surrogate prediction result."""
    eta_hid: float
    eta_total: float
    H: float
    P_shaft: float
    confidence: float = Field(..., ge=0, le=1, description="Model confidence 0-1")
    surrogate_version: str
    latency_ms: float


class SimilarDesignResult(BaseModel):
    """A similar design found in training_log."""
    ns: float
    d2_mm: float
    eta_total: float
    fonte: str
    qualidade: float
    modelo_bomba: Optional[str] = None


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health():
    """API health check."""
    return {"status": "ok", "version": "2.0.0", "service": "HPE"}


# ---------------------------------------------------------------------------
# Sizing endpoint
# ---------------------------------------------------------------------------

@app.post("/sizing/run", response_model=SizingOutput, tags=["Sizing"])
async def run_sizing(inp: SizingInput) -> SizingOutput:
    """Execute 1D meanline sizing for a centrifugal pump.

    Given Q, H, n and fluid properties, returns impeller geometry
    estimates (D1, D2, b2, beta1, beta2), performance (eta, P) and
    NPSH requirements.

    All computation is physics-based (Gülich correlations).
    Typical latency: < 50 ms.
    """
    t0 = time.perf_counter()
    try:
        import math
        from hpe.core.models import OperatingPoint
        from hpe.core.enums import MachineType, FluidType
        from hpe.sizing.meanline import run_sizing as _run_sizing

        op = OperatingPoint(
            flow_rate=inp.Q,
            head=inp.H,
            rpm=inp.n,
            machine_type=MachineType.CENTRIFUGAL_PUMP,
            fluid=FluidType.WATER if inp.fluid == "water" else FluidType.CUSTOM,
            fluid_density=inp.rho,
            fluid_viscosity=inp.nu * inp.rho,
        )
        result = _run_sizing(op)

        g = 9.80665
        omega = inp.n * math.pi / 30
        Ns = inp.n * inp.Q**0.5 / (inp.H**0.75 + 1e-9)
        Nq = Ns
        omega_s = omega * inp.Q**0.5 / (g * inp.H)**0.75

        # Extract velocity triangle data if available
        vt = getattr(result, "velocity_triangles", None)
        inlet = getattr(vt, "inlet", None) if vt else None
        outlet = getattr(vt, "outlet", None) if vt else None

        u2 = (outlet.u if outlet else math.pi * result.impeller_d2 * inp.n / 60)
        beta1 = getattr(inlet, "beta", 20.0) if inlet else 20.0
        beta2 = getattr(outlet, "beta", 22.5) if outlet else 22.5

        # Shaft power estimate
        eta = result.estimated_efficiency
        P_shaft = inp.rho * g * inp.Q * inp.H / (eta + 1e-9) / 1000  # kW

        # D1 estimate from meridional profile
        meridional = getattr(result, "meridional_profile", None)
        D1 = getattr(meridional, "d1", result.impeller_d2 * 0.45) if meridional else result.impeller_d2 * 0.45

        elapsed_ms = (time.perf_counter() - t0) * 1000
        log.info("sizing.run: Q=%.4f H=%.1f n=%.0f -> Nq=%.1f D2=%.0fmm eta=%.1f%% in %.1fms",
                 inp.Q, inp.H, inp.n, Nq, result.impeller_d2*1000, eta*100, elapsed_ms)

        return SizingOutput(
            Ns=round(Ns, 2),
            Nq=round(Nq, 2),
            omega_s=round(omega_s, 4),
            D1=round(D1, 4),
            D2=round(result.impeller_d2, 4),
            b2=round(result.impeller_b2, 4),
            beta1=round(beta1, 1),
            beta2=round(beta2, 1),
            u2=round(u2, 2),
            eta_hid=round(getattr(result, "eta_hydraulic", eta * 1.05), 4),
            eta_total=round(eta, 4),
            P_shaft=round(P_shaft, 2),
            NPSHr=round(result.estimated_npsh_r, 2),
            warnings=getattr(result, "warnings", []),
            computation_time_ms=round(elapsed_ms, 1),
        )

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        log.exception("sizing.run error")
        raise HTTPException(status_code=500, detail=f"Sizing error: {e}")


# ---------------------------------------------------------------------------
# Surrogate endpoints
# ---------------------------------------------------------------------------

_evaluator = None  # lazy-loaded singleton


def _get_evaluator():
    global _evaluator
    if _evaluator is None:
        from hpe.ai.surrogate.evaluator import SurrogateEvaluator
        try:
            _evaluator = SurrogateEvaluator.load_default()
            log.info("surrogate: model loaded successfully")
        except FileNotFoundError as e:
            log.warning("surrogate: model not found — %s", e)
            return None
    return _evaluator


@app.post("/surrogate/predict", response_model=SurrogatePredictOutput, tags=["Surrogate"])
async def surrogate_predict(inp: SurrogatePredictInput) -> SurrogatePredictOutput:
    """Predict pump performance using the surrogate model.

    Much faster than CFD (~4 ms vs ~30 min).
    Includes a confidence score based on training data coverage.

    Acceptance criterion: RMSE <= 8% vs real bench data.
    Current v1 RMSE: 2.8-3.0% (XGBoost trained on 2931 bench records).
    """
    ev = _get_evaluator()
    if ev is None:
        raise HTTPException(
            status_code=503,
            detail="Surrogate model not available. Run training first.",
        )
    try:
        from hpe.ai.surrogate.evaluator import SurrogateInput
        si = SurrogateInput(
            Ns=inp.Ns, D2=inp.D2, b2=inp.b2, beta2=inp.beta2,
            n=inp.n, Q=inp.Q, H=inp.H, n_stages=inp.n_stages,
        )
        out = ev.predict(si)
        return SurrogatePredictOutput(
            eta_hid=out.eta_hid,
            eta_total=out.eta_total,
            H=out.H,
            P_shaft=out.P_shaft,
            confidence=out.confidence,
            surrogate_version=out.surrogate_version,
            latency_ms=out.latency_ms,
        )
    except Exception as e:
        log.exception("surrogate.predict error")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/surrogate/similar", response_model=list[SimilarDesignResult], tags=["Surrogate"])
async def surrogate_similar(
    ns: float,
    d2_mm: float,
    limit: int = 5,
    min_quality: float = 0.8,
) -> list[SimilarDesignResult]:
    """Find similar pump designs in the training log.

    Used in the UI to show: 'We found N similar projects. Best case: eta=X%'.

    Parameters
    ----------
    ns : Specific speed of target design.
    d2_mm : Impeller diameter [mm].
    limit : Max results (default 5).
    min_quality : Minimum quality score filter (default 0.8).
    """
    try:
        from hpe.data.training_log import query_similar
        rows = query_similar(ns=ns, d2_mm=d2_mm, limit=limit, min_quality=min_quality)
        return [
            SimilarDesignResult(
                ns=r.get("ns", 0),
                d2_mm=r.get("d2_mm", 0),
                eta_total=r.get("eta_total", 0),
                fonte=r.get("fonte", ""),
                qualidade=r.get("qualidade", 0),
                modelo_bomba=r.get("modelo_bomba"),
            )
            for r in rows
        ]
    except Exception as e:
        log.exception("surrogate.similar error")
        raise HTTPException(status_code=500, detail=str(e))
