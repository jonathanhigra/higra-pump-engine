"""HPE project file format (.hpe) — JSON + gzip with full design state.

The .hpe file stores:
- Project metadata (name, author, date, software version)
- Operating point parameters
- Sizing result
- Optimization history (if any)
- Custom notes

Format: UTF-8 JSON compressed with gzip, extension .hpe

Usage:
    from hpe.core.project_file import save_project, load_project

    save_project("my_pump.hpe", project_data)
    project = load_project("my_pump.hpe")
"""
from __future__ import annotations
import gzip
import json
import datetime
from pathlib import Path
from typing import Any

HPE_VERSION = "1.0"
HPE_MAGIC = "HPE_PROJECT"


def save_project(path: str | Path, data: dict[str, Any]) -> None:
    """Save project to .hpe file (JSON + gzip).

    Args:
        path: Output file path (.hpe extension recommended).
        data: Project data dict. Keys:
            - name: str
            - author: str
            - operating_point: dict
            - sizing_result: dict (optional)
            - optimization_history: list (optional)
            - notes: str (optional)
    """
    envelope = {
        "magic": HPE_MAGIC,
        "version": HPE_VERSION,
        "saved_at": datetime.datetime.now().isoformat(),
        "software": "HPE — Higra Pump Engine",
        "data": data,
    }
    json_bytes = json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8")
    with gzip.open(Path(path), "wb", compresslevel=6) as f:
        f.write(json_bytes)


def load_project(path: str | Path) -> dict[str, Any]:
    """Load project from .hpe file.

    Args:
        path: Path to .hpe file.

    Returns:
        Project data dict with 'data' key containing the stored fields.

    Raises:
        ValueError: If file is not a valid .hpe file.
        FileNotFoundError: If file does not exist.
    """
    with gzip.open(Path(path), "rb") as f:
        content = f.read()

    envelope = json.loads(content.decode("utf-8"))

    if envelope.get("magic") != HPE_MAGIC:
        raise ValueError(f"Not a valid HPE project file: {path}")

    return envelope


def project_to_dict(
    name: str,
    author: str,
    op: Any,  # OperatingPoint
    sizing: Any = None,  # SizingResult
    optimization_history: list = None,
    notes: str = "",
) -> dict:
    """Convert HPE objects to serializable project dict."""
    import dataclasses

    def to_dict(obj):
        if obj is None:
            return None
        if dataclasses.is_dataclass(obj):
            d = {}
            for f in dataclasses.fields(obj):
                v = getattr(obj, f.name)
                d[f.name] = to_dict(v)
            return d
        if isinstance(obj, (list, tuple)):
            return [to_dict(item) for item in obj]
        if isinstance(obj, dict):
            return {k: to_dict(v) for k, v in obj.items()}
        return obj

    return {
        "name": name,
        "author": author,
        "operating_point": to_dict(op),
        "sizing_result": to_dict(sizing),
        "optimization_history": optimization_history or [],
        "notes": notes,
    }
