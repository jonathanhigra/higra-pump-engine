"""OpenFOAM execution via subprocess.

Runs OpenFOAM commands (blockMesh, snappyHexMesh, simpleFoam)
as subprocesses and monitors progress.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class RunResult:
    """Result of an OpenFOAM execution step."""

    command: str
    returncode: int
    stdout: str
    stderr: str
    success: bool


def check_openfoam_available() -> bool:
    """Check if OpenFOAM is available on the system."""
    try:
        result = subprocess.run(
            ["simpleFoam", "-help"],
            capture_output=True, text=True, timeout=10,
        )
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def run_case(
    case_dir: Path | str,
    parallel: bool = False,
    n_procs: int = 4,
    timeout: Optional[int] = None,
) -> list[RunResult]:
    """Execute a complete OpenFOAM case.

    Runs the pipeline: blockMesh → snappyHexMesh → simpleFoam

    Args:
        case_dir: Path to the case directory.
        parallel: Whether to run in parallel.
        n_procs: Number of processors (if parallel).
        timeout: Maximum time per step [seconds].

    Returns:
        List of RunResult for each step.

    Raises:
        FileNotFoundError: If OpenFOAM is not installed.
    """
    case_dir = Path(case_dir)
    results: list[RunResult] = []

    if not check_openfoam_available():
        raise FileNotFoundError(
            "OpenFOAM not found. Install OpenFOAM or run the case "
            "manually with: cd {case_dir} && ./run.sh"
        )

    # Step 1: blockMesh
    results.append(_run_command("blockMesh", case_dir, timeout))
    if not results[-1].success:
        return results

    # Step 2: snappyHexMesh
    results.append(_run_command("snappyHexMesh", case_dir, timeout, ["-overwrite"]))
    if not results[-1].success:
        return results

    # Step 3: solver
    if parallel:
        results.append(_run_command("decomposePar", case_dir, timeout, ["-force"]))
        if not results[-1].success:
            return results

        solver_cmd = ["mpirun", "-np", str(n_procs), "simpleFoam", "-parallel"]
        results.append(_run_command_raw(solver_cmd, case_dir, timeout))

        if results[-1].success:
            results.append(_run_command("reconstructPar", case_dir, timeout, ["-latestTime"]))
    else:
        results.append(_run_command("simpleFoam", case_dir, timeout))

    return results


def _run_command(
    cmd: str,
    case_dir: Path,
    timeout: Optional[int] = None,
    args: Optional[list[str]] = None,
) -> RunResult:
    """Run a single OpenFOAM command."""
    full_cmd = [cmd] + (args or [])
    return _run_command_raw(full_cmd, case_dir, timeout)


def _run_command_raw(
    cmd: list[str],
    case_dir: Path,
    timeout: Optional[int] = None,
) -> RunResult:
    """Run a command in the case directory."""
    cmd_str = " ".join(cmd)
    try:
        result = subprocess.run(
            cmd,
            cwd=str(case_dir),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return RunResult(
            command=cmd_str,
            returncode=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr,
            success=result.returncode == 0,
        )
    except subprocess.TimeoutExpired:
        return RunResult(
            command=cmd_str,
            returncode=-1,
            stdout="",
            stderr=f"Command timed out after {timeout}s",
            success=False,
        )
    except FileNotFoundError:
        return RunResult(
            command=cmd_str,
            returncode=-1,
            stdout="",
            stderr=f"Command not found: {cmd[0]}",
            success=False,
        )
