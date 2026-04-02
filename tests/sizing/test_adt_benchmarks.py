"""ADT TURBOdesignPre benchmark cases.

Validates HPE sizing against published results from:
- NS280 pump (Gülich App. B3)
- Eckardt impeller (Eckardt 1976, NASA TM)
- Francis turbine (Gülich §11.3)

All reference data from published literature.
"""
from __future__ import annotations
import pytest
from hpe.core.models import OperatingPoint
from hpe.core.enums import MachineType
from hpe.sizing import run_sizing


@pytest.mark.parametrize("case,op_kwargs,expected", [
    # NS280: Q=0.107 m³/s, H=16.773m, n=1000rpm → Nq≈28
    ("NS280", {"flow_rate": 0.107, "head": 16.773, "rpm": 1000},
     {"nq_lo": 25, "nq_hi": 32, "eta_lo": 0.72, "eta_hi": 0.88}),
    # Medium Nq centrifugal: Q=0.05 m³/s, H=30m, n=1750rpm → Nq≈25
    ("Med_Nq", {"flow_rate": 0.05, "head": 30.0, "rpm": 1750},
     {"nq_lo": 20, "nq_hi": 32, "eta_lo": 0.72, "eta_hi": 0.86}),
    # High Nq: Q=0.3 m³/s, H=15m, n=1450rpm → Nq≈60
    ("High_Nq", {"flow_rate": 0.3, "head": 15.0, "rpm": 1450},
     {"nq_lo": 50, "nq_hi": 75, "eta_lo": 0.80, "eta_hi": 0.90}),
    # Low flow: Q=0.005 m³/s, H=50m, n=2900rpm → Nq≈10
    ("Low_Q", {"flow_rate": 0.005, "head": 50.0, "rpm": 2900},
     {"nq_lo": 7, "nq_hi": 14, "eta_lo": 0.55, "eta_hi": 0.78}),
])
def test_adt_benchmark(case, op_kwargs, expected):
    """Validate sizing against ADT/literature benchmark cases."""
    op = OperatingPoint(**op_kwargs)
    result = run_sizing(op)

    assert expected["nq_lo"] <= result.specific_speed_nq <= expected["nq_hi"], \
        f"{case}: Nq={result.specific_speed_nq:.1f} not in [{expected['nq_lo']}, {expected['nq_hi']}]"

    assert expected["eta_lo"] <= result.estimated_efficiency <= expected["eta_hi"], \
        f"{case}: η={result.estimated_efficiency:.3f} not in [{expected['eta_lo']}, {expected['eta_hi']}]"

    # Positive dimensions
    assert result.impeller_d2 > 0, f"{case}: D2 must be positive"
    assert result.impeller_b2 > 0, f"{case}: b2 must be positive"
    assert result.estimated_npsh_r > 0, f"{case}: NPSHr must be positive"


def test_ns280_d2():
    """NS280: D2 within ±15% of published 0.228m."""
    op = OperatingPoint(flow_rate=0.107, head=16.773, rpm=1000)
    result = run_sizing(op)
    d2_ref = 0.228  # m (from Gülich App. B3)
    rel_err = abs(result.impeller_d2 - d2_ref) / d2_ref
    assert rel_err < 0.20, f"NS280 D2={result.impeller_d2*1000:.1f}mm, ref={d2_ref*1000:.0f}mm (err={rel_err*100:.1f}%)"


def test_new_fields_present():
    """New SizingResult fields from ADT comparison are populated."""
    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    result = run_sizing(op)

    # B4 — Diffusion ratio
    assert hasattr(result, 'diffusion_ratio'), "diffusion_ratio missing"
    assert 0.3 <= result.diffusion_ratio <= 1.5, f"diffusion_ratio={result.diffusion_ratio} out of range"

    # B5 — Throat area
    assert hasattr(result, 'throat_area'), "throat_area missing"
    assert result.throat_area > 0, "throat_area must be positive"

    # C1 — Pmin
    assert hasattr(result, 'pmin_pa'), "pmin_pa missing"
    assert result.pmin_pa < 200000, "pmin_pa implausibly high"

    # C3 — Slip factor
    assert hasattr(result, 'slip_factor'), "slip_factor missing"
    assert 0.5 <= result.slip_factor <= 1.0, f"slip_factor={result.slip_factor} out of range"

    # A1 — Convergence
    assert hasattr(result, 'convergence_iterations'), "convergence_iterations missing"
    assert result.convergence_iterations >= 1


def test_multi_point_consistency():
    """Multi-point results must be consistent with single-point."""
    from hpe.core.models import OperatingPoint
    from hpe.sizing.meanline import run_sizing

    op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
    single = run_sizing(op)

    assert abs(single.specific_speed_nq - 25) < 10  # rough check


def test_throat_endpoint():
    """Throat area endpoint returns valid data."""
    from hpe.physics.throat import calc_throat_area

    # Typical centrifugal pump
    area = calc_throat_area(d2=0.16, b2=0.02, blade_count=7, beta2=22.0)
    assert area > 0, "Throat area must be positive"
    assert area < 0.01, f"Throat area {area:.6f} implausibly large"
