"""Seed training_log from bancada HIGRA approved records.

Seeds hpe.training_log with real bench test data from hgr_lab_reg_teste.
Only 'Aprovado' records with valid physics are inserted.
Idempotent — uses ON CONFLICT DO NOTHING on (ns, q_m3h, n_rpm, fonte).

Usage
-----
    python -m hpe.data.bancada_seed              # insert all approved records
    python -m hpe.data.bancada_seed --limit 100  # insert up to 100 records
    python -m hpe.data.bancada_seed --dry-run     # print stats without inserting
"""

from __future__ import annotations

import argparse
import logging
import math
import os
import re
import sys
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SIGS_DB_URL = os.getenv(
    "DATABASE_SIGS_URL",
    "postgresql://postgres:higra123@localhost:5432/higra_sigs",
)

HPE_DB_URL = os.getenv(
    "HPE_DATABASE_URL",
    "postgresql://postgres:higra123@localhost:5432/db_pump_engine",
)

SOURCE_TABLE = "hgr_lab_reg_teste"
G = 9.80665


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _connect(url: str) -> psycopg2.extensions.connection:
    """Create a psycopg2 connection from a postgres:// URL."""
    m = re.match(
        r"postgresql://(?P<user>[^:]+):(?P<pwd>[^@]+)@(?P<host>[^:/]+)"
        r"(?::(?P<port>\d+))?/(?P<db>.+)",
        url,
    )
    if not m:
        raise ValueError(f"Cannot parse DB URL: {url}")
    return psycopg2.connect(
        host=m.group("host"),
        port=int(m.group("port") or 5432),
        user=m.group("user"),
        password=m.group("pwd"),
        dbname=m.group("db"),
    )


def _parse_diarotor(val) -> Optional[float]:
    """Parse diarotor column (varchar like '351', '360/125', '360x2') → float mm.

    Takes the first numeric token before any '/', 'x', or 'X' separator.
    Returns None if parsing fails.
    """
    if val is None:
        return None
    s = str(val).strip()
    # Split on '/' or 'x'/'X' and take first segment
    part = re.split(r"[/xX]", s)[0].strip()
    try:
        v = float(part)
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> Optional[float]:
    """Coerce to float, returning None on failure or non-positive."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _compute_ns(n_rpm: float, q_m3h: float, h_m: float) -> Optional[float]:
    """Compute specific speed Ns = n * sqrt(Q[m3/s]) / H^0.75.

    Returns None if any input is non-positive.
    """
    q_m3s = q_m3h / 3600.0
    if n_rpm <= 0 or q_m3s <= 0 or h_m <= 0:
        return None
    return n_rpm * math.sqrt(q_m3s) / (h_m ** 0.75)


# ---------------------------------------------------------------------------
# Physics bounds for validation (same as ETL)
# ---------------------------------------------------------------------------

BOUNDS = {
    "q_m3h":     (0.36, 36000.0),   # m³/h  (= 0.0001–10 m³/s)
    "h_m":       (0.5,  350.0),     # m
    "n_rpm":     (500.0, 3600.0),   # rpm
    "eta_total": (5.0,  95.0),      # %
    "d2_mm":     (50.0, 800.0),     # mm
    "p_shaft_kw": (0.1, 5000.0),    # kW
}


def _passes_bounds(row: dict) -> tuple[bool, str]:
    """Return (True, '') if row passes all physics bounds, else (False, reason)."""
    checks = [
        ("q_m3h",     row.get("q_m3h")),
        ("h_m",       row.get("h_m")),
        ("n_rpm",     row.get("n_rpm")),
        ("eta_total", row.get("eta_total")),
        ("d2_mm",     row.get("d2_mm")),
    ]
    for name, val in checks:
        if val is None:
            return False, f"{name} is None"
        lo, hi = BOUNDS[name]
        if not (lo <= val <= hi):
            return False, f"{name}={val:.3g} out of [{lo}, {hi}]"
    return True, ""


# ---------------------------------------------------------------------------
# Extract from SIGS
# ---------------------------------------------------------------------------

_EXTRACT_SQL = f"""
SELECT
    id,
    modelobomba,
    qntdeestag,
    vazm3h,
    pressaototal,
    rotacao,
    diarotor,
    rendbomba,
    rendhidroenerg,
    potmecancia,
    aprovacao,
    aprovcalc
FROM {SOURCE_TABLE}
ORDER BY id
"""


def extract_bancada(conn: psycopg2.extensions.connection) -> list[dict]:
    """Pull all rows from source table and return as list of dicts."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_EXTRACT_SQL)
        rows = [dict(r) for r in cur.fetchall()]
    log.info("extract_bancada: %d rows fetched from %s", len(rows), SOURCE_TABLE)
    return rows


# ---------------------------------------------------------------------------
# Transform: raw row → training_log record
# ---------------------------------------------------------------------------

def _transform_row(raw: dict, min_quality: float) -> Optional[dict]:
    """Transform a raw bancada row into a training_log insert dict.

    Returns None if the row should be skipped.
    """
    # Only 'Aprovado' records
    aprovacao = str(raw.get("aprovacao") or "").strip().lower()
    aprovcalc = str(raw.get("aprovcalc") or "").strip().lower()
    if "aprov" not in aprovacao and "aprov" not in aprovcalc:
        return None

    # Parse geometry
    d2_mm = _parse_diarotor(raw.get("diarotor"))
    n_stages = int(_safe_float(raw.get("qntdeestag")) or 1)
    n_stages = max(n_stages, 1)

    # Parse operating conditions
    q_m3h = _safe_float(raw.get("vazm3h"))
    h_total = _safe_float(raw.get("pressaototal"))
    n_rpm = _safe_float(raw.get("rotacao"))
    eta_total = _safe_float(raw.get("rendbomba"))
    eta_hid_raw = _safe_float(raw.get("rendhidroenerg"))
    p_shaft_kw = _safe_float(raw.get("potmecancia"))

    # Per-stage head
    h_m = h_total / n_stages if (h_total is not None and n_stages > 0) else h_total

    # Build pre-check dict
    check = {
        "q_m3h": q_m3h,
        "h_m": h_m,
        "n_rpm": n_rpm,
        "eta_total": eta_total,
        "d2_mm": d2_mm,
    }
    ok, reason = _passes_bounds(check)
    if not ok:
        return None

    # Compute specific speed
    ns = _compute_ns(n_rpm, q_m3h, h_m)
    if ns is None or ns <= 0:
        return None

    # Build record
    record: dict = {
        "fonte": "bancada",
        "ns": round(ns, 4),
        "q_m3h": round(q_m3h, 4),
        "h_m": round(h_m, 4),
        "n_rpm": round(n_rpm, 2),
        "d2_mm": round(d2_mm, 2),
        "eta_total": round(eta_total, 4),
        "qualidade": min_quality,
        "n_estagios": n_stages,
    }

    if eta_hid_raw is not None and 5.0 <= eta_hid_raw <= 100.0:
        record["eta_hid"] = round(eta_hid_raw, 4)

    if p_shaft_kw is not None:
        lo, hi = BOUNDS["p_shaft_kw"]
        if lo <= p_shaft_kw <= hi:
            record["p_shaft_kw"] = round(p_shaft_kw, 4)

    modelo = raw.get("modelobomba")
    if modelo:
        record["modelo_bomba"] = str(modelo).strip()[:100]

    return record


# ---------------------------------------------------------------------------
# Load into hpe.training_log
# ---------------------------------------------------------------------------

_INSERT_SQL = """
INSERT INTO hpe.training_log (
    fonte, ns, q_m3h, h_m, n_rpm, d2_mm,
    eta_total, eta_hid, p_shaft_kw,
    qualidade, n_estagios, modelo_bomba
)
VALUES (
    %(fonte)s, %(ns)s, %(q_m3h)s, %(h_m)s, %(n_rpm)s, %(d2_mm)s,
    %(eta_total)s, %(eta_hid)s, %(p_shaft_kw)s,
    %(qualidade)s, %(n_estagios)s, %(modelo_bomba)s
)
ON CONFLICT (ns, q_m3h, n_rpm, fonte) DO NOTHING
"""

_INSERT_SQL_NO_CONFLICT = """
INSERT INTO hpe.training_log (
    fonte, ns, q_m3h, h_m, n_rpm, d2_mm,
    eta_total, eta_hid, p_shaft_kw,
    qualidade, n_estagios, modelo_bomba
)
SELECT
    %(fonte)s, %(ns)s, %(q_m3h)s, %(h_m)s, %(n_rpm)s, %(d2_mm)s,
    %(eta_total)s, %(eta_hid)s, %(p_shaft_kw)s,
    %(qualidade)s, %(n_estagios)s, %(modelo_bomba)s
WHERE NOT EXISTS (
    SELECT 1 FROM hpe.training_log
    WHERE fonte  = %(fonte)s
      AND ns     = %(ns)s
      AND q_m3h  = %(q_m3h)s
      AND n_rpm  = %(n_rpm)s
)
"""

_CREATE_UNIQUE_IDX = """
CREATE UNIQUE INDEX IF NOT EXISTS training_log_bancada_dedup_idx
    ON hpe.training_log (ns, q_m3h, n_rpm, fonte)
"""


def _ensure_unique_index(conn: psycopg2.extensions.connection) -> bool:
    """Attempt to create the deduplication unique index if it does not exist.

    Returns True if the index was already present or was created successfully.
    Returns False if creation failed (e.g. pre-existing duplicates).
    """
    try:
        with conn.cursor() as cur:
            cur.execute(_CREATE_UNIQUE_IDX)
        conn.commit()
        log.info("Unique index training_log_bancada_dedup_idx ensured.")
        return True
    except Exception as exc:
        conn.rollback()
        log.warning(
            "Could not create dedup index (may already exist or have duplicates): %s", exc
        )
        return False


def _insert_batch(
    conn: psycopg2.extensions.connection,
    records: list[dict],
    use_on_conflict: bool = True,
) -> tuple[int, int]:
    """Insert a list of records. Returns (inserted, skipped).

    Parameters
    ----------
    use_on_conflict : bool
        If True, use ``ON CONFLICT DO NOTHING`` (requires unique index).
        If False, use a ``WHERE NOT EXISTS`` sub-select for idempotency.
    """
    inserted = 0
    skipped = 0
    sql = _INSERT_SQL if use_on_conflict else _INSERT_SQL_NO_CONFLICT
    with conn.cursor() as cur:
        for rec in records:
            # Fill optional columns with None when missing
            row = {
                "fonte":        rec["fonte"],
                "ns":           rec["ns"],
                "q_m3h":        rec["q_m3h"],
                "h_m":          rec["h_m"],
                "n_rpm":        rec["n_rpm"],
                "d2_mm":        rec["d2_mm"],
                "eta_total":    rec["eta_total"],
                "eta_hid":      rec.get("eta_hid"),
                "p_shaft_kw":   rec.get("p_shaft_kw"),
                "qualidade":    rec["qualidade"],
                "n_estagios":   rec.get("n_estagios", 1),
                "modelo_bomba": rec.get("modelo_bomba"),
            }
            cur.execute(sql, row)
            if cur.rowcount == 1:
                inserted += 1
            else:
                skipped += 1
    conn.commit()
    return inserted, skipped


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def seed_from_bancada(
    limit: Optional[int] = None,
    min_quality: float = 0.8,
    dry_run: bool = False,
) -> dict:
    """Load approved bancada records and insert into hpe.training_log.

    Parameters
    ----------
    limit : int, optional
        Maximum number of source rows to process (useful for testing).
    min_quality : float
        Quality score assigned to all bancada records (default 0.8).
    dry_run : bool
        If True, transform and validate records but do not write to the DB.

    Returns
    -------
    dict
        Summary: {"inserted": N, "skipped": N, "errors": N, "total_attempted": N}
    """
    stats = {"inserted": 0, "skipped": 0, "errors": 0, "total_attempted": 0}

    # 1. Extract from SIGS
    sigs_conn = _connect(SIGS_DB_URL)
    try:
        rows = extract_bancada(sigs_conn)
    finally:
        sigs_conn.close()

    if limit is not None:
        rows = rows[:limit]

    # 2. Transform
    records: list[dict] = []
    skipped_transform = 0
    for raw in rows:
        try:
            rec = _transform_row(raw, min_quality)
            if rec is None:
                skipped_transform += 1
            else:
                records.append(rec)
        except Exception as exc:
            log.warning("transform error on row id=%s: %s", raw.get("id"), exc)
            stats["errors"] += 1

    log.info(
        "transform: %d valid records, %d skipped (not-approved / out-of-bounds)",
        len(records), skipped_transform,
    )

    stats["total_attempted"] = len(records)
    stats["skipped"] += skipped_transform

    if dry_run:
        log.info("dry-run: skipping DB writes. Would attempt %d inserts.", len(records))
        stats["inserted"] = 0
        return stats

    # 3. Load into training_log
    hpe_conn = _connect(HPE_DB_URL)
    try:
        # Try to create a unique index for ON CONFLICT support; fall back to
        # WHERE NOT EXISTS if the index cannot be created (e.g. duplicates exist).
        has_unique_idx = _ensure_unique_index(hpe_conn)
        inserted, conflict_skipped = _insert_batch(
            hpe_conn, records, use_on_conflict=has_unique_idx
        )
        stats["inserted"] = inserted
        stats["skipped"] += conflict_skipped
    except Exception as exc:
        hpe_conn.rollback()
        log.exception("seed_from_bancada: DB insert failed: %s", exc)
        stats["errors"] += 1
        raise
    finally:
        hpe_conn.close()

    log.info(
        "seed_from_bancada: inserted=%d skipped=%d errors=%d",
        stats["inserted"], stats["skipped"], stats["errors"],
    )
    return stats


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
        stream=sys.stdout,
    )

    parser = argparse.ArgumentParser(description="Seed training_log from bancada HIGRA")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Max number of source rows to process (default: all)",
    )
    parser.add_argument(
        "--min-quality", type=float, default=0.8,
        help="Quality score assigned to bancada records (default: 0.8)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Transform records but do not write to DB",
    )
    args = parser.parse_args()

    result = seed_from_bancada(
        limit=args.limit,
        min_quality=args.min_quality,
        dry_run=args.dry_run,
    )

    print("\n=== Bancada Seed Summary ===")
    print(f"  Total attempted : {result['total_attempted']}")
    print(f"  Inserted        : {result['inserted']}")
    print(f"  Skipped         : {result['skipped']}")
    print(f"  Errors          : {result['errors']}")
