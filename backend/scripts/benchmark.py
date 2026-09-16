"""Run a representative query workload and persist measured latency samples.

Usage: ``python scripts/benchmark.py --runs 60``
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db.session import SessionLocal
from app.main import run_query
from app.metrics import LAYER_FIELDS, _percentile

QUESTIONS = [
    "Find the warmest temperature in the Arabian Sea",
    "Find the coldest salinity in the Indian Ocean",
    "What is the average temperature from 0 to 100 meters?",
    "What is the average salinity from 0 to 500 meters?",
    "Compare temperature between float 1 and float 2",
    "Compare salinity between float 3 and float 4",
    "Show recent oxygen observations near the Somali coast",
    "Tell me about deep chlorophyll profiles in the Arabian Sea",
    "Which profiles are warmest in the North Atlantic?",
    "What is the latest mixed-layer salinity?",
    "Find similar temperature anomalies in adjacent regions",
    "Find similar oxygen anomalies in adjacent regions",
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=60, help="number of varied questions to execute (50-100 recommended)")
    args = parser.parse_args()
    runs = max(1, args.runs)
    samples: list[dict[str, float]] = []
    with SessionLocal() as db:
        for index in range(runs):
            result = run_query(QUESTIONS[index % len(QUESTIONS)], db)
            samples.append({field: float(result.get("latency", {}).get(field, 0.0) or 0.0) for field in LAYER_FIELDS})
    print(f"Executed {len(samples)} queries and persisted benchmark_runs samples.")
    for field in LAYER_FIELDS:
        values = [sample[field] for sample in samples]
        print(f"{field}: p50={_percentile(values, 0.50):.2f} ms p95={_percentile(values, 0.95):.2f} ms")


if __name__ == "__main__":
    main()
