"""FastAPI application for Higra Pump Engine."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hpe.api.routes.sizing import router as sizing_router

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

app.include_router(sizing_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "higra-pump-engine"}
