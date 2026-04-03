"""Design template API endpoints.

    GET  /api/v1/templates              — list all 12 design templates
    GET  /api/v1/templates/{name}       — get full template details
    POST /api/v1/templates/{name}/run   — run sizing with template params
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from hpe.sizing.design_templates import get_template, list_templates, run_template

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])


@router.get("")
def get_all_templates() -> List[Dict[str, Any]]:
    """List all available design templates with summary info."""
    return list_templates()


@router.get("/{name}")
def get_template_detail(name: str) -> Dict[str, Any]:
    """Get full details of a specific design template."""
    try:
        return get_template(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{name}/run")
def run_template_sizing(name: str) -> Dict[str, Any]:
    """Run 1D sizing using a template's pre-loaded parameters."""
    try:
        return run_template(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sizing failed: {exc}")
