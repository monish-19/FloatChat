"""Persistence and aggregation for measured query pipeline timings."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import BenchmarkRun

LAYER_FIELDS = ("embedding_ms", "faiss_ms", "retrieval_ms", "sql_ms", "graph_ms", "llm_ms", "total_ms")


def _percentile(values: Iterable[float], percentile: float) -> float:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return round(ordered[0], 2)
    # Linear interpolation is stable for both small live samples and benchmarks.
    rank = (len(ordered) - 1) * percentile
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = rank - lower
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * fraction, 2)


def percentile_snapshot(runs: Iterable[BenchmarkRun]) -> dict[str, dict[str, float]]:
    samples = list(runs)
    return {
        field: {
            "p50": _percentile((getattr(run, field, 0.0) or 0.0 for run in samples), 0.50),
            "p95": _percentile((getattr(run, field, 0.0) or 0.0 for run in samples), 0.95),
        }
        for field in LAYER_FIELDS
    }


def metrics_snapshot(db: Session, *, limit: int = 200) -> dict[str, Any]:
    """Read recent samples and return a JSON-ready percentile snapshot."""
    try:
        runs = list(
            db.scalars(
                select(BenchmarkRun).order_by(BenchmarkRun.timestamp.desc()).limit(max(1, min(limit, 1000)))
            ).all()
        )
    except SQLAlchemyError:
        # A deployment can serve queries while a migration is pending.
        return {"sample_count": 0, "percentiles": {field: {"p50": 0.0, "p95": 0.0} for field in LAYER_FIELDS}, "recent_runs": []}
    return {
        "sample_count": len(runs),
        "percentiles": percentile_snapshot(runs),
        "recent_runs": [
            {
                "id": run.id,
                "timestamp": run.timestamp.isoformat() if run.timestamp else None,
                "question": run.question,
                "layer": run.layer,
                "latency": {field: round(float(getattr(run, field) or 0.0), 2) for field in LAYER_FIELDS},
            }
            for run in runs[:10]
        ],
    }


def persist_run(db: Session, question: str, result: dict[str, Any]) -> None:
    """Persist a sample without making telemetry failures break /query."""
    if not hasattr(db, "add") or not hasattr(db, "commit"):
        return
    latency = result.get("latency") or {}
    sample = BenchmarkRun(
        timestamp=datetime.now(timezone.utc),
        question=question,
        embedding_ms=float(latency.get("embedding_ms", 0.0) or 0.0),
        faiss_ms=float(latency.get("faiss_ms", 0.0) or 0.0),
        retrieval_ms=float(latency.get("retrieval_ms", 0.0) or 0.0),
        sql_ms=float(latency.get("sql_ms", 0.0) or 0.0),
        graph_ms=float(latency.get("graph_ms", 0.0) or 0.0),
        llm_ms=float(latency.get("llm_ms", 0.0) or 0.0),
        total_ms=float(latency.get("total_ms", 0.0) or 0.0),
        layer=(result.get("summary") or {}).get("layer"),
    )
    try:
        db.add(sample)
        db.commit()
    except Exception:
        # Metrics are best-effort, including when benchmark_runs has not migrated.
        try:
            db.rollback()
        except Exception:
            pass
