"""Database migration runner for HPE.

Usage:
    python -m hpe.db.migrate          # run all pending migrations
    python -m hpe.db.migrate --check  # check connection only
"""
from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def _load_dotenv():
    env_path = Path(__file__).parents[4] / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def run_schema():
    _load_dotenv()
    from hpe.db.connection import get_connection, test_connection

    if not test_connection():
        log.error("Cannot connect to database. Check credentials in backend/.env")
        return False

    schema_path = Path(__file__).parent / "schema.sql"
    if not schema_path.exists():
        log.error("schema.sql not found at %s", schema_path)
        return False

    sql = schema_path.read_text(encoding="utf-8")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    log.info("Schema applied successfully to db_pump_engine")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    _load_dotenv()
    if args.check:
        from hpe.db.connection import test_connection
        ok = test_connection()
        exit(0 if ok else 1)
    else:
        ok = run_schema()
        exit(0 if ok else 1)
