"""Reference geometry database for centrifugal pumps.

Based on published data from:
- Gülich (2014) Table 7.1
- Stepanoff (1957) Appendix
- KSB pump engineering book
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass
class ReferenceGeometry:
    """Typical pump geometry from literature database."""
    source: str
    nq_range: tuple[float, float]
    d1_d2: float        # Typical D1/D2
    b2_d2: float        # Typical b2/D2
    beta2_deg: float    # Typical beta2
    blade_count: int    # Typical Z
    psi: float          # Head coefficient
    eta_best: float     # Best achievable efficiency
    notes: str = ""


# Database of reference geometries indexed by Nq range
REFERENCE_DATABASE: list[ReferenceGeometry] = [
    ReferenceGeometry(
        source="Gülich 2014, Table 7.1",
        nq_range=(5, 15),
        d1_d2=0.32, b2_d2=0.03, beta2_deg=18.0, blade_count=7,
        psi=0.55, eta_best=0.68,
        notes="Very low Nq: high head multistage pump",
    ),
    ReferenceGeometry(
        source="Gülich 2014, Table 7.1",
        nq_range=(15, 30),
        d1_d2=0.38, b2_d2=0.06, beta2_deg=20.0, blade_count=7,
        psi=0.52, eta_best=0.75,
        notes="Low Nq: standard centrifugal pump",
    ),
    ReferenceGeometry(
        source="Gülich 2014, Table 7.1 / Stepanoff",
        nq_range=(30, 50),
        d1_d2=0.45, b2_d2=0.10, beta2_deg=22.5, blade_count=6,
        psi=0.48, eta_best=0.82,
        notes="Medium Nq: optimal range for single-stage",
    ),
    ReferenceGeometry(
        source="Gülich 2014, Table 7.1",
        nq_range=(50, 80),
        d1_d2=0.54, b2_d2=0.16, beta2_deg=26.0, blade_count=5,
        psi=0.42, eta_best=0.85,
        notes="Medium-high Nq: approaching mixed-flow",
    ),
    ReferenceGeometry(
        source="Gülich 2014 / KSB",
        nq_range=(80, 120),
        d1_d2=0.62, b2_d2=0.26, beta2_deg=30.0, blade_count=5,
        psi=0.36, eta_best=0.87,
        notes="High Nq: mixed-flow transition",
    ),
    ReferenceGeometry(
        source="Stepanoff 1957",
        nq_range=(120, 200),
        d1_d2=0.70, b2_d2=0.38, beta2_deg=35.0, blade_count=4,
        psi=0.28, eta_best=0.88,
        notes="Very high Nq: mixed-flow/axial pump",
    ),
]


def get_reference_geometry(nq: float) -> ReferenceGeometry | None:
    """Return the closest reference geometry for a given Nq."""
    for ref in REFERENCE_DATABASE:
        lo, hi = ref.nq_range
        if lo <= nq < hi:
            return ref
    # Return nearest if out of range
    if nq < REFERENCE_DATABASE[0].nq_range[0]:
        return REFERENCE_DATABASE[0]
    return REFERENCE_DATABASE[-1]


def get_all_references() -> list[dict]:
    """Return all reference geometries as a list of dicts."""
    return [
        {
            "source": r.source,
            "nq_min": r.nq_range[0],
            "nq_max": r.nq_range[1],
            "d1_d2": r.d1_d2,
            "b2_d2": r.b2_d2,
            "beta2_deg": r.beta2_deg,
            "blade_count": r.blade_count,
            "psi": r.psi,
            "eta_best": r.eta_best,
            "notes": r.notes,
        }
        for r in REFERENCE_DATABASE
    ]
