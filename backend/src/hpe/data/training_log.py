"""Training log — registers every CFD/sizing run as a training data point.

Golden rule of HPE: every simulation run MUST be recorded here.
The training_log feeds the surrogate models in subsequent phases.

Table
-----
hpe.training_log  (PostgreSQL — db_pump_engine)

Usage
-----
    from hpe.data.training_log import TrainingLogEntry, insert_entry

    entry = TrainingLogEntry(
        fonte="cfd_openfoam",
        ns=35.0, d2_mm=320.0, n_rpm=1750,
        q_m3h=200.0, h_m=45.0,
        eta_total=78.5, p_shaft_kw=48.2,
        qualidade=0.95,
    )
    row_id = insert_entry(entry)
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import asdict, dataclass
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor

log = logging.getLogger(__name__)

DB_URL = os.getenv(
    "HPE_DATABASE_URL",
    "postgresql://postgres:higra123@localhost:5432/db_pump_engine",
)

VALID_FONTES = frozenset({"bancada", "cfd_openfoam", "cfd_su2", "sizing_1d"})


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------

@dataclass
class TrainingLogEntry:
    """One row in hpe.training_log.

    Parameters
    ----------
    fonte : str
        Data source: 'bancada' | 'cfd_openfoam' | 'cfd_su2' | 'sizing_1d'.
    ns : float
        Specific speed n*sqrt(Q) / H^0.75  [rpm, m3/s, m].
    d2_mm : float
        Impeller outlet diameter [mm].
    n_rpm : float
        Rotational speed [rpm].
    q_m3h : float
        Flow rate [m3/h].
    h_m : float
        Total head [m].
    eta_total : float
        Total pump efficiency [%].
    p_shaft_kw : float
        Shaft power [kW].
    qualidade : float
        Data quality score 0-1 (CFD convergence, measurement confidence).
    """

    fonte: str
    ns: float
    d2_mm: float
    n_rpm: float
    q_m3h: float
    h_m: float
    eta_total: float
    p_shaft_kw: float
    qualidade: float = 1.0

    # Optional geometry
    projeto_id: Optional[str] = None
    nq: Optional[float] = None
    d1_mm: Optional[float] = None
    b2_mm: Optional[float] = None
    beta1_deg: Optional[float] = None
    beta2_deg: Optional[float] = None
    z_palhetas: Optional[int] = None

    # Optional dimensionless features
    phi: Optional[float] = None
    psi: Optional[float] = None
    re_rotor: Optional[float] = None
    n_estagios: int = 1

    # Optional targets
    eta_hid: Optional[float] = None
    npsh_r_m: Optional[float] = None

    # Metadata
    modelo_bomba: Optional[str] = None
    notas: Optional[str] = None

    def __post_init__(self) -> None:
        if self.fonte not in VALID_FONTES:
            raise ValueError(f"fonte must be one of {VALID_FONTES}, got {self.fonte!r}")
        if not 0.0 <= self.qualidade <= 1.0:
            raise ValueError(f"qualidade must be in [0, 1], got {self.qualidade}")

    def to_db_dict(self) -> dict:
        """Return dict with only non-None values, matching DB column names."""
        return {k: v for k, v in asdict(self).items() if v is not None}


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _connect() -> psycopg2.extensions.connection:
    m = re.match(
        r"postgresql://(?P<user>[^:]+):(?P<pwd>[^@]+)@(?P<host>[^:/]+)"
        r"(?::(?P<port>\d+))?/(?P<db>.+)",
        DB_URL,
    )
    if not m:
        raise ValueError(f"Cannot parse HPE_DATABASE_URL: {DB_URL}")
    return psycopg2.connect(
        host=m.group("host"),
        port=int(m.group("port") or 5432),
        user=m.group("user"),
        password=m.group("pwd"),
        dbname=m.group("db"),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def insert_entry(entry: TrainingLogEntry) -> str:
    """Insert a training log entry and return the generated UUID.

    Parameters
    ----------
    entry : TrainingLogEntry
        The run data to register.

    Returns
    -------
    str
        UUID of the inserted row.

    Notes
    -----
    Golden rule: EVERY CFD/optimization run must be logged here.
    """
    data = entry.to_db_dict()
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))

    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO hpe.training_log ({cols}) VALUES ({placeholders}) RETURNING id",
                list(data.values()),
            )
            row_id = str(cur.fetchone()[0])
        conn.commit()
        log.info(
            "training_log: inserted %s (fonte=%s, eta=%.1f%%, D2=%.0fmm)",
            row_id, entry.fonte, entry.eta_total, entry.d2_mm,
        )
        return row_id
    except Exception:
        conn.rollback()
        log.exception("training_log: failed to insert entry")
        raise
    finally:
        conn.close()


def insert_from_sizing(sizing_result: dict, qualidade: float = 0.7) -> str:
    """Convenience: log a sizing_1d result directly.

    Parameters
    ----------
    sizing_result : dict
        Output of hpe.sizing.meanline.run_sizing() serialised as dict.
    qualidade : float
        Confidence score (default 0.7 — lower than CFD data).
    """
    nq = sizing_result.get("specific_speed_nq", 0)
    entry = TrainingLogEntry(
        fonte="sizing_1d",
        ns=nq * 51.65,
        nq=nq,
        d2_mm=sizing_result.get("impeller_d2", 0) * 1000,
        b2_mm=(sizing_result.get("impeller_b2", 0) * 1000) or None,
        n_rpm=sizing_result.get("speed", 0),
        q_m3h=sizing_result.get("flow_rate", 0) * 3600,
        h_m=sizing_result.get("head", 0),
        eta_total=sizing_result.get("estimated_efficiency", 0) * 100,
        p_shaft_kw=sizing_result.get("p_shaft", 0),
        npsh_r_m=sizing_result.get("estimated_npsh_r"),
        qualidade=qualidade,
        notas="auto-logged from sizing_1d",
    )
    return insert_entry(entry)


def query_similar(
    ns: float,
    d2_mm: float,
    tolerance: float = 0.20,
    limit: int = 10,
    min_quality: float = 0.8,
) -> list[dict]:
    """Find similar designs in training_log by Ns and D2.

    Parameters
    ----------
    ns : float
        Target specific speed.
    d2_mm : float
        Target impeller diameter [mm].
    tolerance : float
        Relative tolerance for similarity (default +/-20%).
    limit : int
        Maximum number of results.
    min_quality : float
        Minimum quality score filter.

    Returns
    -------
    list[dict]
        Rows ordered by Ns proximity.
    """
    conn = _connect()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *, abs(ns - %s) / NULLIF(%s, 0) AS ns_dist
                FROM hpe.training_log
                WHERE ns BETWEEN %s AND %s
                  AND d2_mm BETWEEN %s AND %s
                  AND qualidade >= %s
                ORDER BY ns_dist ASC
                LIMIT %s
                """,
                [
                    ns, ns,
                    ns * (1 - tolerance), ns * (1 + tolerance),
                    d2_mm * (1 - tolerance), d2_mm * (1 + tolerance),
                    min_quality, limit,
                ],
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_stats() -> dict:
    """Return aggregate statistics of the training_log table."""
    conn = _connect()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    COUNT(*)           AS total_rows,
                    COUNT(DISTINCT fonte) AS n_sources,
                    AVG(eta_total)     AS avg_eta,
                    AVG(qualidade)     AS avg_quality,
                    MIN(created_at)    AS oldest,
                    MAX(created_at)    AS newest
                FROM hpe.training_log
            """)
            return dict(cur.fetchone())
    finally:
        conn.close()
