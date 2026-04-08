"""SnappyHexMesh and blockMesh configuration generators — Fase 2 CFD Pipeline.

Provides:
  - generate_snappy_dict()    — string generator (API legado)
  - write_snappy_hex_mesh_dict() — escreve system/snappyHexMeshDict
  - write_block_mesh_dict()   — escreve system/blockMeshDict
  - check_mesh_quality()      — lê checkMesh output (se disponível)
  - MeshQualityReport         — dataclass de resultado
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


def generate_snappy_dict(
    geometry_file: str,
    d2: float,
    refinement_level: int = 3,
    n_layers: int = 3,
    layer_expansion: float = 1.2,
) -> str:
    """Generate snappyHexMeshDict content.

    Args:
        geometry_file: Name of the geometry file (e.g., "impeller.stl").
        d2: Outlet diameter [m] (used for location-in-mesh).
        refinement_level: Surface refinement level (2-5).
        n_layers: Number of boundary layer cells.
        layer_expansion: Layer expansion ratio.

    Returns:
        snappyHexMeshDict file content as string.
    """
    geom_name = Path(geometry_file).stem

    # Location inside mesh (a point clearly inside the domain, outside geometry)
    loc_x = d2 * 0.8
    loc_y = 0.0
    loc_z = d2 * 0.3

    return f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      snappyHexMeshDict;
}}

castellatedMesh true;
snap            true;
addLayers       true;

geometry
{{
    {geom_name}
    {{
        type triSurfaceMesh;
        file "{geometry_file}";
    }}
}}

castellatedMeshControls
{{
    maxLocalCells   1000000;
    maxGlobalCells  2000000;
    minRefinementCells 10;
    maxLoadUnbalance 0.10;
    nCellsBetweenLevels 3;

    features
    (
    );

    refinementSurfaces
    {{
        {geom_name}
        {{
            level ({refinement_level} {refinement_level + 1});
            patchInfo
            {{
                type wall;
            }}
        }}
    }}

    resolveFeatureAngle 30;

    refinementRegions
    {{
    }}

    locationInMesh ({loc_x:.6f} {loc_y:.6f} {loc_z:.6f});
    allowFreeStandingZoneFaces true;
}}

snapControls
{{
    nSmoothPatch    3;
    tolerance       2.0;
    nSolveIter      100;
    nRelaxIter      5;
    nFeatureSnapIter 10;
    implicitFeatureSnap true;
    explicitFeatureSnap false;
    multiRegionFeatureSnap false;
}}

addLayersControls
{{
    relativeSizes   true;

    layers
    {{
        "{geom_name}.*"
        {{
            nSurfaceLayers {n_layers};
        }}
    }}

    expansionRatio  {layer_expansion};
    finalLayerThickness 0.3;
    minThickness    0.1;
    nGrow           0;
    featureAngle    60;
    nRelaxIter      5;
    nSmoothSurfaceNormals 1;
    nSmoothNormals  3;
    nSmoothThickness 10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedialAxisAngle 90;
    nBufferCellsNoExtrude 0;
    nLayerIter      50;
}}

meshQualityControls
{{
    maxNonOrtho     65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave      80;
    minVol          1e-13;
    minTetQuality   -1e30;
    minArea         -1;
    minTwist        0.02;
    minDeterminant  0.001;
    minFaceWeight   0.05;
    minVolRatio     0.01;
    minTriangleTwist -1;
    nSmoothScale    4;
    errorReduction  0.75;
}}

writeFlags      (scalarLevels layerSets layerFields);
mergeTolerance  1e-6;
"""


# ---------------------------------------------------------------------------
# File-writing API
# ---------------------------------------------------------------------------

_FOAM_HEADER = """\
FoamFile
{{
    version     2.0;
    format      ascii;
    class       {cls};
    object      {obj};
}}
"""


def write_snappy_hex_mesh_dict(
    case_dir: Path,
    stl_file: str | None = None,
    refinement_level: tuple[int, int] = (2, 3),
    n_surface_layers: int = 5,
) -> Path:
    """Escrever system/snappyHexMeshDict.

    Parameters
    ----------
    case_dir : Path
        Raiz do caso OpenFOAM.
    stl_file : str | None
        Nome do arquivo STL em constant/triSurface (e.g. 'runner.stl').
        Se None, usa 'runner.stl' por padrão.
    refinement_level : tuple[int, int]
        (min, max) nível de refinamento de superfície.
    n_surface_layers : int
        Número de camadas de refinamento na parede.

    Returns
    -------
    Path
        Caminho do arquivo gerado.
    """
    if stl_file is None:
        stl_file = "runner.stl"
    geom_name = Path(stl_file).stem

    loc_x = 0.01
    loc_y = 0.0
    loc_z = 0.0

    content = _FOAM_HEADER.format(cls="dictionary", obj="snappyHexMeshDict")
    content += f"""
castellatedMesh true;
snap            true;
addLayers       true;

geometry
{{
    {geom_name}
    {{
        type triSurfaceMesh;
        file "{stl_file}";

        regions
        {{
            rotorWalls  {{ name rotorWalls; }}
        }}
    }}

    rotatingZone
    {{
        type    searchableCylinder;
        point1  (0 0 -0.05);
        point2  (0 0  0.05);
        radius  0.15;
    }}
}}

castellatedMeshControls
{{
    maxLocalCells       500000;
    maxGlobalCells      2000000;
    minRefinementCells  10;
    maxLoadUnbalance    0.10;
    nCellsBetweenLevels 3;

    features
    (
    );

    refinementSurfaces
    {{
        {geom_name}
        {{
            level ({refinement_level[0]} {refinement_level[1]});
            patchInfo
            {{
                type wall;
                inGroups (rotorWalls);
            }}
        }}
    }}

    resolveFeatureAngle 30;

    refinementRegions
    {{
        rotatingZone
        {{
            mode    inside;
            levels  ((1E15 1));
        }}
    }}

    locationInMesh ({loc_x:.6f} {loc_y:.6f} {loc_z:.6f});
    allowFreeStandingZoneFaces true;
}}

snapControls
{{
    nSmoothPatch            3;
    tolerance               2.0;
    nSolveIter              100;
    nRelaxIter              5;
    nFeatureSnapIter        10;
    implicitFeatureSnap     true;
    explicitFeatureSnap     false;
    multiRegionFeatureSnap  false;
}}

addLayersControls
{{
    relativeSizes   true;

    layers
    {{
        "{geom_name}.*"
        {{
            nSurfaceLayers {n_surface_layers};
        }}
    }}

    expansionRatio              1.3;
    finalLayerThickness         0.3;
    minThickness                0.1;
    nGrow                       0;
    featureAngle                60;
    nRelaxIter                  5;
    nSmoothSurfaceNormals       1;
    nSmoothNormals              3;
    nSmoothThickness            10;
    maxFaceThicknessRatio       0.5;
    maxThicknessToMedialRatio   0.3;
    minMedialAxisAngle          90;
    nBufferCellsNoExtrude       0;
    nLayerIter                  50;
}}

meshQualityControls
{{
    maxNonOrtho             65;
    maxBoundarySkewness     20;
    maxInternalSkewness     4;
    maxConcave              80;
    minVol                  1e-13;
    minTetQuality           -1e30;
    minArea                 -1;
    minTwist                0.02;
    minDeterminant          0.001;
    minFaceWeight           0.05;
    minVolRatio             0.01;
    minTriangleTwist        -1;
    nSmoothScale            4;
    errorReduction          0.75;
}}

writeFlags      (scalarLevels layerSets layerFields);
mergeTolerance  1e-6;
"""
    path = case_dir / "system" / "snappyHexMeshDict"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def write_block_mesh_dict(
    case_dir: Path,
    d2: float,
    domain_factor: float = 3.0,
) -> Path:
    """Escrever system/blockMeshDict — background mesh cilíndrica.

    Parameters
    ----------
    case_dir : Path
        Raiz do caso OpenFOAM.
    d2 : float
        Diâmetro de saída do rotor [m] — usado para escalar o domínio.
    domain_factor : float
        Fator de escala do domínio em relação a D2 (default 3.0).

    Returns
    -------
    Path
        Caminho do arquivo gerado.
    """
    r = d2 * domain_factor / 2.0
    z_min = -d2 * 1.0
    z_max = d2 * 1.5

    # Número de células
    n_xy = max(10, int(domain_factor * 8))
    n_z = max(10, int(domain_factor * 6))

    content = _FOAM_HEADER.format(cls="dictionary", obj="blockMeshDict")
    content += f"""
scale   1;

vertices
(
    ({-r:.6f} {-r:.6f} {z_min:.6f})   // 0
    ({ r:.6f} {-r:.6f} {z_min:.6f})   // 1
    ({ r:.6f} { r:.6f} {z_min:.6f})   // 2
    ({-r:.6f} { r:.6f} {z_min:.6f})   // 3
    ({-r:.6f} {-r:.6f} {z_max:.6f})   // 4
    ({ r:.6f} {-r:.6f} {z_max:.6f})   // 5
    ({ r:.6f} { r:.6f} {z_max:.6f})   // 6
    ({-r:.6f} { r:.6f} {z_max:.6f})   // 7
);

blocks
(
    hex (0 1 2 3 4 5 6 7) ({n_xy} {n_xy} {n_z}) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    inlet
    {{
        type patch;
        faces
        (
            (4 5 6 7)
        );
    }}

    outlet
    {{
        type patch;
        faces
        (
            (0 3 2 1)
        );
    }}

    statorWalls
    {{
        type wall;
        faces
        (
            (0 1 5 4)
            (1 2 6 5)
            (2 3 7 6)
            (3 0 4 7)
        );
    }}
);
"""
    path = case_dir / "system" / "blockMeshDict"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# Verificação de qualidade da malha
# ---------------------------------------------------------------------------


@dataclass
class MeshQualityReport:
    """Relatório de qualidade de malha OpenFOAM.

    Critérios mínimos para turbomáquinas:
      - non-ortho < 70°  (ideal < 65°)
      - skewness < 4.0
      - aspect_ratio < 100

    Attributes
    ----------
    max_non_ortho : float
        Máxima não-ortogonalidade [graus].
    max_skewness : float
        Máximo skewness.
    aspect_ratio_max : float
        Máxima razão de aspecto de célula.
    passes : bool
        True se todos os critérios estão dentro dos limites.
    """

    max_non_ortho: float
    max_skewness: float
    aspect_ratio_max: float
    passes: bool

    # Limites usados para a avaliação
    _NON_ORTHO_LIMIT: float = 70.0
    _SKEWNESS_LIMIT: float = 4.0
    _ASPECT_RATIO_LIMIT: float = 100.0

    def __str__(self) -> str:
        status = "PASS" if self.passes else "FAIL"
        return (
            f"MeshQuality [{status}]  "
            f"non-ortho={self.max_non_ortho:.1f}°  "
            f"skewness={self.max_skewness:.2f}  "
            f"aspect_ratio={self.aspect_ratio_max:.1f}"
        )


def check_mesh_quality(case_dir: Path) -> MeshQualityReport:
    """Verificar qualidade da malha via checkMesh (OpenFOAM).

    Executa `checkMesh` no diretório do caso e parseia a saída para
    extrair as métricas de qualidade.  Se checkMesh não estiver disponível
    ou a malha não existir, retorna valores padrão com passes=False.

    Parameters
    ----------
    case_dir : Path
        Raiz do caso OpenFOAM (deve conter constant/polyMesh/).

    Returns
    -------
    MeshQualityReport
        Métricas extraídas (ou valores padrão se não disponível).
    """
    _defaults = MeshQualityReport(
        max_non_ortho=0.0,
        max_skewness=0.0,
        aspect_ratio_max=0.0,
        passes=False,
    )

    poly_mesh = case_dir / "constant" / "polyMesh"
    if not poly_mesh.exists():
        return _defaults

    try:
        result = subprocess.run(
            ["checkMesh"],
            cwd=str(case_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        output = result.stdout + result.stderr
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return _defaults

    # Parsear saída do checkMesh
    non_ortho = _parse_float(output, r"Max non-orthogonality\s*=\s*([\d.]+)")
    skewness = _parse_float(output, r"Max skewness\s*=\s*([\d.]+)")
    aspect_ratio = _parse_float(output, r"Max aspect ratio\s*=\s*([\d.]+)")

    passes = (
        non_ortho < MeshQualityReport._NON_ORTHO_LIMIT
        and skewness < MeshQualityReport._SKEWNESS_LIMIT
        and aspect_ratio < MeshQualityReport._ASPECT_RATIO_LIMIT
        and non_ortho > 0  # indica que parseou valores reais
    )

    return MeshQualityReport(
        max_non_ortho=non_ortho,
        max_skewness=skewness,
        aspect_ratio_max=aspect_ratio,
        passes=passes,
    )


def _parse_float(text: str, pattern: str, default: float = 0.0) -> float:
    """Extrair float de texto via regex."""
    m = re.search(pattern, text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return default
