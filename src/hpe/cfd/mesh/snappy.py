"""SnappyHexMesh configuration generator.

Generates snappyHexMeshDict for refining the background mesh
and snapping it to the pump geometry (from STEP/STL file).
"""

from __future__ import annotations

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
