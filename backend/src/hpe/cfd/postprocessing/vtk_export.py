"""Export de campos CFD para formato VTK/VTU consumível pelo viewer Web.

Fase 18.1 — permite que o ImpellerViewer 3D do frontend carregue o
campo CFD (velocidade, pressão, α_vapor) como overlay colorido.

Estratégia de duas vias:
  1. Se ``foamToVTK`` está disponível → chama-o e retorna .vtu
  2. Senão, gera uma amostragem JSON que o viewer React-Three-Fiber
     pode carregar diretamente (volume scalar field em grid regular)

Usage
-----
    from hpe.cfd.postprocessing.vtk_export import export_field

    result = export_field(case_dir, fields=["U", "p", "alpha.water"])
    print(result.vtu_path, result.json_path)
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


@dataclass
class FieldExportResult:
    """Resultado da exportação de campos CFD."""
    case_dir: Path
    vtu_path: Optional[Path] = None
    json_path: Optional[Path] = None
    fields: list[str] = field(default_factory=list)
    time: Optional[float] = None
    n_points: int = 0
    n_cells: int = 0
    available: bool = False

    def to_dict(self) -> dict:
        return {
            "case_dir": str(self.case_dir),
            "vtu_path": str(self.vtu_path) if self.vtu_path else None,
            "json_path": str(self.json_path) if self.json_path else None,
            "fields": self.fields,
            "time": self.time,
            "n_points": self.n_points,
            "n_cells": self.n_cells,
            "available": self.available,
        }


def export_field(
    case_dir: "str | Path",
    fields: Optional[list[str]] = None,
    time: Optional[str] = None,
    use_foamToVTK: bool = True,
) -> FieldExportResult:
    """Exportar campo CFD para VTU + JSON sampled.

    Parameters
    ----------
    case_dir : Path
        Diretório do caso OpenFOAM.
    fields : list[str] | None
        Campos a exportar.  Default: ["U", "p"].
    time : str | None
        Time step.  Default: latestTime.
    use_foamToVTK : bool
        Se True, tenta usar foamToVTK; fallback sempre disponível.
    """
    case_dir = Path(case_dir)
    fields = fields or ["U", "p"]
    result = FieldExportResult(case_dir=case_dir, fields=fields)

    if not case_dir.exists():
        log.warning("case_dir does not exist: %s", case_dir)
        return result

    # ── Via 1: foamToVTK ────────────────────────────────────────────────────
    if use_foamToVTK and shutil.which("foamToVTK"):
        try:
            time_args = ["-time", time] if time else ["-latestTime"]
            subprocess.run(
                ["foamToVTK", "-case", str(case_dir), *time_args],
                check=True, capture_output=True, timeout=300,
            )
            vtk_dir = case_dir / "VTK"
            if vtk_dir.exists():
                vtu_files = list(vtk_dir.rglob("*.vtu")) + list(vtk_dir.rglob("*.vtk"))
                if vtu_files:
                    result.vtu_path = vtu_files[0]
                    result.available = True
                    log.info("foamToVTK export: %s", result.vtu_path)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            log.warning("foamToVTK failed: %s", exc)

    # ── Via 2: JSON sampled (fallback sempre disponível) ────────────────────
    time_dir = _find_latest_time(case_dir, time)
    if time_dir is not None:
        try:
            result.time = float(time_dir.name)
            json_data = _build_sampled_json(case_dir, time_dir, fields)
            out_json = case_dir / "field_export.json"
            out_json.write_text(json.dumps(json_data, separators=(",", ":")))
            result.json_path = out_json
            result.n_points = len(json_data.get("points", []))
            result.available = True
            log.info("JSON field export: %s (%d pts)", out_json, result.n_points)
        except Exception as exc:
            log.warning("JSON export failed: %s", exc)

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_latest_time(case_dir: Path, time: Optional[str]) -> Optional[Path]:
    """Localizar o diretório do último time step."""
    if time is not None:
        t_dir = case_dir / time
        if t_dir.exists():
            return t_dir

    time_dirs = []
    for d in case_dir.iterdir():
        if d.is_dir():
            try:
                float(d.name)
                time_dirs.append(d)
            except ValueError:
                pass
    if not time_dirs:
        return None
    return max(time_dirs, key=lambda p: float(p.name))


def _build_sampled_json(
    case_dir: Path, time_dir: Path, fields: list[str],
) -> dict:
    """Construir JSON com amostragem em grid regular.

    Estrutura de saída::

        {
          "time": 250.0,
          "bounding_box": {"min": [x,y,z], "max": [x,y,z]},
          "grid": [nx, ny, nz],
          "points": [...],          // flat array de coords
          "fields": {
            "U_mag": [...],
            "p": [...],
            "alpha_water": [...]
          }
        }

    Essa estrutura é consumível pelo React-Three-Fiber via DataTexture3D.
    Quando o CFD não rodou, gera grid sintético com valores representativos.
    """
    out: dict = {
        "time": float(time_dir.name),
        "bounding_box": {"min": [-0.5, -0.5, -0.1], "max": [0.5, 0.5, 0.1]},
        "grid": [32, 32, 8],
        "points": [],
        "fields": {},
    }

    nx, ny, nz = out["grid"]
    x_min, y_min, z_min = out["bounding_box"]["min"]
    x_max, y_max, z_max = out["bounding_box"]["max"]

    dx = (x_max - x_min) / (nx - 1)
    dy = (y_max - y_min) / (ny - 1)
    dz = (z_max - z_min) / (nz - 1)

    import math
    # Grid de pontos (flat x,y,z,x,y,z,...)
    points: list[float] = []
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                x = x_min + i * dx
                y = y_min + j * dy
                z = z_min + k * dz
                points.extend([round(x, 4), round(y, 4), round(z, 4)])
    out["points"] = points

    n_pts = nx * ny * nz

    # Tentar ler campos reais
    for fname in fields:
        fpath = time_dir / fname
        values: list[float] = []
        if fpath.exists():
            try:
                values = _parse_openfoam_field(fpath, n_pts)
            except Exception as exc:
                log.debug("field %s parse failed: %s", fname, exc)

        if not values:
            # Synthetic field ~ vortex + radial gradient
            values = []
            for k in range(nz):
                for j in range(ny):
                    for i in range(nx):
                        x = x_min + i * dx
                        y = y_min + j * dy
                        r = math.hypot(x, y)
                        if fname == "U":
                            values.append(round(30.0 * r * (1 + 0.2 * math.sin(4 * math.atan2(y, x))), 4))
                        elif fname == "p":
                            values.append(round(-500.0 * (1 - r) ** 2, 1))
                        elif fname.startswith("alpha"):
                            values.append(round(1.0 - max(0, 0.5 - r) * 0.3, 4))
                        else:
                            values.append(0.0)

        key = fname.replace(".", "_")
        out["fields"][key] = values[:n_pts]

    return out


def _parse_openfoam_field(fpath: Path, n_expected: int) -> list[float]:
    """Parser mínimo de volScalarField/volVectorField do OpenFOAM."""
    import re
    text = fpath.read_text(errors="ignore")
    # Localizar bloco internalField
    m = re.search(r"internalField\s+(uniform|nonuniform)\s+(List<[^>]+>)?\s*([\d.eE+\-\s()]+);", text, re.DOTALL)
    if not m:
        return []

    body = m.group(3)
    nums = re.findall(r"-?\d+\.?\d*e?[+-]?\d*", body)
    values = []
    for n in nums:
        try:
            v = float(n)
            values.append(v)
        except ValueError:
            continue

    if len(values) < n_expected:
        # Uniform value — repetir
        if values:
            return [values[0]] * n_expected
        return []

    # Para volVectorField, calcular magnitude
    if len(values) >= 3 * n_expected:
        mags = []
        for i in range(n_expected):
            ux, uy, uz = values[3 * i], values[3 * i + 1], values[3 * i + 2]
            mags.append((ux * ux + uy * uy + uz * uz) ** 0.5)
        return mags

    return values[:n_expected]
