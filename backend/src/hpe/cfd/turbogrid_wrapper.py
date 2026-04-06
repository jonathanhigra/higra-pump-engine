"""TurboGrid automation wrapper -- generates batch scripts for mesh generation.

Produces Python automation scripts and Windows batch files that drive
ANSYS TurboGrid from HPE sizing results.  The generated Python script
uses TurboGrid's built-in Python API and must be run *inside* TurboGrid
(File > Run Script), not as a standalone interpreter.

References:
    ANSYS TurboGrid User's Guide -- Scripting and batch mode.
"""

from __future__ import annotations

import textwrap


def generate_turbogrid_script(
    geo_file: str,
    output_mesh: str,
    blade_count: int,
    hub_tip_ratio: float = 0.35,
    boundary_layer_first_height: float = 0.01,
    boundary_layer_growth: float = 1.2,
    boundary_layer_layers: int = 15,
    global_size_factor: float = 1.0,
) -> str:
    """Generate TurboGrid Python automation script.

    The generated script uses TurboGrid's built-in ``cfxtg`` Python API
    and must be run from within TurboGrid, not as a standalone script.

    Args:
        geo_file: Path to the .geo blade geometry file.
        output_mesh: Path for the exported mesh file (.gtm).
        blade_count: Number of blades (for periodicity).
        hub_tip_ratio: Hub-to-tip radius ratio at inlet.
        boundary_layer_first_height: First cell height [mm].
        boundary_layer_growth: Boundary layer growth rate.
        boundary_layer_layers: Number of boundary layer rows.
        global_size_factor: Global mesh size factor (1.0 = default).

    Returns:
        String content of the TurboGrid automation script.
    """
    script = textwrap.dedent(f"""\
        #!/usr/bin/env python
        # TurboGrid Automation Script -- HPE Generated
        # Usage: Open TurboGrid > File > Run Script > Select this file
        #
        # NOTE: This script uses TurboGrid's built-in Python API.
        # It must be run FROM WITHIN TurboGrid, not standalone.
        #
        # Alternative: Import blade.geo manually in TurboGrid GUI:
        #   1. File > Load Blade Set > Select blade.geo
        #   2. Set blade count to {blade_count}
        #   3. Machine Data > Set rotation axis to Z
        #   4. Mesh > Global Size Factor = {global_size_factor}
        #   5. Mesh > Generate Mesh
        #   6. File > Save Mesh As > {output_mesh}

        # --- TurboGrid Python API (run inside TurboGrid) ---
        try:
            # Import blade geometry
            objMgr = cfxtg.GetObjectManager()
            bladeSet = objMgr.GetObject("BladeSet")
            bladeSet.SetExpression("Blade Count", "{blade_count}")

            # Load the .geo blade definition
            cfxtg.LoadBladeSet("{geo_file}")

            # Machine data
            machineData = objMgr.GetObject("Machine Data")
            machineData.SetExpression("Rotation Axis", "Z")

            # Mesh settings
            meshCtrl = objMgr.GetObject("Mesh Data")
            meshCtrl.SetExpression("Global Size Factor", "{global_size_factor}")
            meshCtrl.SetExpression(
                "Boundary Layer First Element Height",
                "{boundary_layer_first_height} [mm]",
            )
            meshCtrl.SetExpression(
                "Boundary Layer Growth Rate", "{boundary_layer_growth}"
            )
            meshCtrl.SetExpression(
                "Boundary Layer Maximum Layers", "{boundary_layer_layers}"
            )

            # Topology
            meshCtrl.SetExpression("Topology Set", "ATM Optimized")

            # Generate mesh
            cfxtg.GenerateMesh()

            # Export
            cfxtg.ExportMesh("{output_mesh}")

            print("Mesh generation complete: {output_mesh}")

        except NameError:
            print("ERROR: This script must be run inside TurboGrid.")
            print("Open TurboGrid > File > Run Script")
            print("Or import blade.geo manually following the instructions above.")
    """)
    return script


def generate_turbogrid_bat(geo_path: str, output_path: str) -> str:
    """Generate a Windows batch file to run TurboGrid.

    The batch file auto-detects the ANSYS installation directory
    and provides instructions for running the TurboGrid script.

    Args:
        geo_path: Path to the .geo file (or .py script).
        output_path: Path for the output mesh file.

    Returns:
        String content of the .bat file.
    """
    return textwrap.dedent(f"""\
        @echo off
        echo ============================================
        echo  HPE TurboGrid Mesh Generation
        echo ============================================
        echo.

        REM Auto-detect ANSYS installation
        if defined AWP_ROOT (
            set "CFXTG=%AWP_ROOT%\\TurboGrid\\bin\\cfxtg.exe"
        ) else if exist "C:\\Program Files\\ANSYS Inc" (
            for /d %%v in ("C:\\Program Files\\ANSYS Inc\\v*") do set "CFXTG=%%v\\TurboGrid\\bin\\cfxtg.exe"
        ) else (
            echo ERROR: ANSYS TurboGrid not found.
            echo Please install ANSYS or set AWP_ROOT environment variable.
            pause
            exit /b 1
        )

        if not exist "%CFXTG%" (
            echo ERROR: TurboGrid executable not found at %CFXTG%
            echo Please update the CFXTG path or set AWP_ROOT.
            pause
            exit /b 1
        )

        echo Using: %CFXTG%
        echo.
        echo NOTE: For automatic mesh generation, open TurboGrid and run:
        echo   File ^> Run Script ^> turbogrid_mesh.py
        echo.
        echo Or import {geo_path} manually in TurboGrid GUI.
        echo.
        echo Output mesh: {output_path}
        pause
    """)
