"""FastAPI application for Higra Pump Engine."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hpe.api.routes.sizing import router as sizing_router
from hpe.api.routes.analysis import router as analysis_router
from hpe.api.routes.projects import router as projects_router
from hpe.api.routes.geometry import router as geometry_router
from hpe.api.routes.report import router as report_router
from hpe.api.routes.ws_optimize import router as ws_optimize_router
from hpe.api.routes.surrogate import router as surrogate_router
from hpe.api.routes.inverse_design import router as inverse_design_router
from hpe.api.routes.optimize_ext import router as optimize_ext_router
from hpe.api.routes.io_routes import router as io_router
from hpe.api.auth import router as auth_router
from hpe.api.routes.design_db_routes import router as design_db_router

app = FastAPI(
    title="Higra Pump Engine",
    description="API for hydraulic turbomachinery design, analysis, and optimization",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from hpe.api.middleware import RateLimitMiddleware, MultitenancyMiddleware
app.add_middleware(RateLimitMiddleware, requests_per_minute=120)
app.add_middleware(MultitenancyMiddleware)

app.include_router(auth_router)
app.include_router(sizing_router)
app.include_router(analysis_router)
app.include_router(geometry_router)
app.include_router(inverse_design_router)
app.include_router(projects_router)
app.include_router(report_router)
app.include_router(ws_optimize_router)
app.include_router(surrogate_router)
app.include_router(optimize_ext_router)
app.include_router(io_router)
app.include_router(design_db_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "higra-pump-engine"}
