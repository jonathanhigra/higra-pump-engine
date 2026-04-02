"""HPE Validation — Benchmark predictions against real test bench data.

Compares HPE sizing and performance predictions with measured data
from HIGRA's test bench (sigs.teste_bancada: 4,036 records, 91 columns).

Usage:
    from hpe.validation import benchmark_sizing, BenchmarkResult

    result = benchmark_sizing(test_data)
"""

from hpe.validation.benchmark import benchmark_sizing, BenchmarkResult

__all__ = ["benchmark_sizing", "BenchmarkResult"]
