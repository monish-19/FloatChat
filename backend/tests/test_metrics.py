from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.models import Base, BenchmarkRun
from app.metrics import metrics_snapshot, percentile_snapshot


def test_percentiles_are_computed_for_each_layer():
    runs = [
        BenchmarkRun(timestamp=datetime.now(timezone.utc), question="one", total_ms=10, embedding_ms=2),
        BenchmarkRun(timestamp=datetime.now(timezone.utc), question="two", total_ms=20, embedding_ms=4),
        BenchmarkRun(timestamp=datetime.now(timezone.utc), question="three", total_ms=30, embedding_ms=6),
    ]
    snapshot = percentile_snapshot(runs)
    assert snapshot["total_ms"]["p50"] == 20
    assert snapshot["total_ms"]["p95"] == 29
    assert snapshot["embedding_ms"]["p50"] == 4


def test_metrics_snapshot_returns_recent_runs():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(
            BenchmarkRun(
                timestamp=datetime.now(timezone.utc),
                question="recent question",
                total_ms=12.5,
                embedding_ms=1,
            )
        )
        db.commit()
        snapshot = metrics_snapshot(db)
    assert snapshot["sample_count"] == 1
    assert snapshot["recent_runs"][0]["question"] == "recent question"
    assert snapshot["percentiles"]["total_ms"]["p50"] == 12.5
