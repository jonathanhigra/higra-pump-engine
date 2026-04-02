"""Import HIGRA test bench data from sigs.teste_bancada.

Reads test bench records from the HIGRA PostgreSQL database (sigs schema)
and stores them in the HPE database for validation and AI training.

Usage:
    python scripts/import-test-bench.py [--source-url SOURCE_DB_URL] [--limit N]

Environment variables:
    SIGS_DATABASE_URL - Source database URL (sigs)
    HPE_DATABASE_URL  - Target database URL (hpe)
"""

from __future__ import annotations

import os
import sys
import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Import HIGRA test bench data")
    parser.add_argument("--source-url", default=os.getenv("SIGS_DATABASE_URL"))
    parser.add_argument("--target-url", default=os.getenv("HPE_DATABASE_URL"))
    parser.add_argument("--limit", type=int, default=None, help="Max records to import")
    parser.add_argument("--dry-run", action="store_true", help="Print stats without importing")
    args = parser.parse_args()

    if not args.source_url:
        print("ERROR: Set SIGS_DATABASE_URL or pass --source-url")
        print("  Example: postgresql://user:pass@host:5432/sigs")
        sys.exit(1)

    try:
        import pandas as pd
        from sqlalchemy import create_engine, text
    except ImportError:
        print("ERROR: Install pandas and sqlalchemy: pip install pandas sqlalchemy psycopg2-binary")
        sys.exit(1)

    # Connect to source (sigs)
    print(f"Connecting to source: {args.source_url[:30]}...")
    source_engine = create_engine(args.source_url)

    # Query test bench data
    query = """
    SELECT
        vazao_m3h,
        altura_manometrica_m,
        rotacao_rpm,
        rendimento_total,
        potencia_eixo_kw,
        npsh_requerido_m,
        modelo_bomba,
        numero_serie,
        data_teste,
        vibracao_mm_s
    FROM sigs.teste_bancada
    WHERE vazao_m3h IS NOT NULL
      AND altura_manometrica_m IS NOT NULL
      AND rotacao_rpm IS NOT NULL
    """

    if args.limit:
        query += f" LIMIT {args.limit}"

    print("Querying sigs.teste_bancada...")
    df = pd.read_sql(text(query), source_engine)
    print(f"  Found {len(df)} records")

    if args.dry_run:
        print("\n--- Dry Run Summary ---")
        print(f"  Records: {len(df)}")
        print(f"  Flow rate range: {df['vazao_m3h'].min():.1f} - {df['vazao_m3h'].max():.1f} m3/h")
        print(f"  Head range: {df['altura_manometrica_m'].min():.1f} - {df['altura_manometrica_m'].max():.1f} m")
        print(f"  RPM range: {df['rotacao_rpm'].min():.0f} - {df['rotacao_rpm'].max():.0f}")
        if 'rendimento_total' in df.columns:
            valid_eta = df['rendimento_total'].dropna()
            if len(valid_eta) > 0:
                print(f"  Efficiency range: {valid_eta.min():.1%} - {valid_eta.max():.1%}")
        print(f"  Unique models: {df['modelo_bomba'].nunique()}")
        return

    # Convert to HPE format
    records = []
    for _, row in df.iterrows():
        records.append({
            "flow_rate": row["vazao_m3h"] / 3600.0,  # m3/h → m3/s
            "head": row["altura_manometrica_m"],
            "rpm": row["rotacao_rpm"],
            "measured_efficiency": row.get("rendimento_total"),
            "measured_power": (row.get("potencia_eixo_kw") or 0) * 1000,  # kW → W
            "measured_npsh": row.get("npsh_requerido_m"),
            "machine_model": row.get("modelo_bomba", ""),
            "serial_number": row.get("numero_serie", ""),
            "measured_vibration": row.get("vibracao_mm_s"),
        })

    # Import to HPE database
    if args.target_url:
        print(f"Importing to HPE database: {args.target_url[:30]}...")
        target_engine = create_engine(args.target_url)

        import_df = pd.DataFrame(records)
        import_df.to_sql(
            "test_bench_records",
            target_engine,
            if_exists="append",
            index=False,
            method="multi",
            chunksize=500,
        )
        print(f"  Imported {len(records)} records to test_bench_records")
    else:
        print("No target URL specified. Saving to output/test_bench_data.csv")
        os.makedirs("output", exist_ok=True)
        pd.DataFrame(records).to_csv("output/test_bench_data.csv", index=False)
        print(f"  Saved {len(records)} records")

    print("Done!")


if __name__ == "__main__":
    main()
