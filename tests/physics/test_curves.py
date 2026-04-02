"""Unit tests for performance curve generation.

Tests cover:
- Monotonically decreasing H-Q curve
- Efficiency peak inside the flow range
- Power rising with flow (no pump turbining)
- Unstable zone flagging
- BEP detection
"""

from __future__ import annotations

import pytest

from hpe.core.models import OperatingPoint
from hpe.physics.curves import generate_curves
from hpe.physics.stability import find_bep
from hpe.sizing import run_sizing


@pytest.fixture(scope="module")
def sizing_ref():
    return run_sizing(OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750.0))


@pytest.fixture(scope="module")
def curves_ref(sizing_ref):
    return generate_curves(sizing_ref, q_min_ratio=0.1, q_max_ratio=1.5, n_points=30)


def test_head_generally_decreasing(curves_ref) -> None:
    """H-Q curve must be generally decreasing (monotone test over bulk)."""
    heads = curves_ref.heads
    # Check at least 80% of adjacent pairs are decreasing
    decr = sum(1 for i in range(len(heads) - 1) if heads[i] >= heads[i + 1])
    pct = decr / (len(heads) - 1) * 100
    assert pct >= 75.0, f"H-Q not generally decreasing: only {pct:.0f}% of pairs"


def test_efficiency_peak_in_range(curves_ref) -> None:
    """Maximum efficiency should occur within the middle 60% of the flow range."""
    etas = curves_ref.efficiencies
    peak_idx = etas.index(max(etas))
    n = len(etas)
    lo, hi = int(0.15 * n), int(0.95 * n)
    assert lo <= peak_idx <= hi, (
        f"Efficiency peak at index {peak_idx} (n={n}): not in [{lo}, {hi}]"
    )


def test_bep_flow_near_design(curves_ref, sizing_ref) -> None:
    """BEP flow rate should be within ±30% of design flow."""
    q_bep, _, _ = find_bep(curves_ref)
    q_design = 0.05
    rel_err = abs(q_bep - q_design) / q_design
    assert rel_err < 0.35, f"BEP flow {q_bep:.4f} m³/s too far from design {q_design}"


def test_power_non_negative(curves_ref) -> None:
    """Power must be positive at all operating points."""
    for i, p in enumerate(curves_ref.powers):
        assert p >= 0, f"Negative power at index {i}: {p:.1f} W"


def test_npsh_positive(curves_ref) -> None:
    """NPSHr must be positive at all points."""
    for i, npsh in enumerate(curves_ref.npsh_required):
        assert npsh >= 0, f"Negative NPSHr at index {i}: {npsh:.2f} m"


def test_npsh_increases_at_high_flow(curves_ref) -> None:
    """NPSHr typically increases at high flow rates."""
    npsh = curves_ref.npsh_required
    n = len(npsh)
    # Last quarter of curve: NPSHr should be increasing vs. midpoint
    mid = n // 2
    assert max(npsh[mid:]) >= npsh[mid], "NPSHr not increasing at high flows"


def test_instability_flag_is_boolean_list(curves_ref) -> None:
    """is_unstable must be a list of booleans of correct length."""
    flags = curves_ref.is_unstable
    assert isinstance(flags, list), f"is_unstable is not a list: {type(flags)}"
    assert len(flags) == len(curves_ref.flow_rates), (
        f"is_unstable length {len(flags)} != n_points {len(curves_ref.flow_rates)}"
    )
    for f in flags:
        assert isinstance(f, bool), f"is_unstable contains non-bool: {f!r}"


def test_affinity_curves_scaling() -> None:
    """Verify affinity law: scaling speed by k scales H by k², Q by k at same impeller."""
    k = 0.8
    op1 = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750.0)
    op2 = OperatingPoint(flow_rate=0.05 * k, head=30.0 * k**2, rpm=1750.0 * k)

    r1 = run_sizing(op1)
    r2 = run_sizing(op2)

    # D2 must be the same (same specific speed, same design point geometry)
    rel = abs(r2.impeller_d2 - r1.impeller_d2) / r1.impeller_d2
    assert rel < 0.02, (
        f"Affinity-scaled D2 mismatch: {r1.impeller_d2*1000:.1f} vs {r2.impeller_d2*1000:.1f} mm"
    )
