from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.models import Base, Float, Measurement, Profile
from app.main import run_query


def _session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = Session(engine)
    db.add(Float(float_id="float-1", wmo_id="wmo-1"))
    db.add(
        Profile(
            profile_id="p-1",
            float_id="float-1",
            timestamp=datetime(2024, 1, 10, tzinfo=timezone.utc),
            lat=10,
            lon=40,
        )
    )
    db.add(Measurement(profile_id="p-1", depth=10, temperature=20, salinity=35))
    db.commit()
    return db


class FakeLLM:
    provider = "mock"
    available = True

    def __init__(self, answer="Grounded answer from the supplied profile."):
        self.answer = answer
        self.prompt = ""

    def complete(self, prompt: str) -> str:
        self.prompt = prompt
        return self.answer


class UnavailableLLM:
    provider = "mock"
    available = False
    reason = "missing-api-key"


class FailingLLM(FakeLLM):
    def complete(self, prompt: str) -> str:
        raise RuntimeError("network failure")


def test_open_ended_query_uses_grounded_llm_fallback(monkeypatch):
    monkeypatch.setattr(
        "app.main.infer_topic",
        lambda question, db: {
            "variable": "temperature",
            "region": "global",
            "region_bbox": None,
            "depth_mode": "surface",
            "depth_range": [0.0, 100.0],
            "time_range": None,
            "confidence": 0.7,
            "semantic_matches": [{"id": "facet:variable:temperature", "score": 0.8, "kind": "variable", "text": "temperature"}],
        },
    )
    client = FakeLLM()
    result = run_query("Tell me about this profile", _session(), llm_client=client)
    assert result["summary"]["layer"] == "llm-fallback"
    assert result["summary"]["fallback"]["status"] == "generated"
    assert "Tell me about this profile" in client.prompt
    assert result["answer"] == client.answer


def test_missing_llm_key_returns_explicit_insufficient_data(monkeypatch):
    monkeypatch.setattr(
        "app.main.infer_topic",
        lambda question, db: {
            "variable": "temperature",
            "region": "global",
            "region_bbox": None,
            "depth_mode": "mixed",
            "depth_range": None,
            "time_range": None,
            "confidence": 0.0,
            "semantic_matches": [],
        },
    )
    result = run_query("Tell me about the ocean", _session(), llm_client=UnavailableLLM())
    assert result["summary"]["layer"] == "semantic-only"
    assert result["summary"]["fallback"]["status"] == "unavailable"
    assert "Insufficient data" in result["answer"]


def test_llm_failure_returns_explicit_insufficient_data(monkeypatch):
    monkeypatch.setattr(
        "app.main.infer_topic",
        lambda question, db: {
            "variable": "temperature",
            "region": "global",
            "region_bbox": None,
            "depth_mode": "surface",
            "depth_range": [0.0, 100.0],
            "time_range": None,
            "confidence": 0.7,
            "semantic_matches": [],
        },
    )
    result = run_query("Tell me about this profile", _session(), llm_client=FailingLLM())
    assert result["summary"]["layer"] == "semantic-only"
    assert result["summary"]["fallback"]["status"] == "failed"
    assert "Insufficient data" in result["answer"]


def test_sql_response_is_tagged_sql(monkeypatch):
    monkeypatch.setattr(
        "app.main.infer_topic",
        lambda question, db: {
            "variable": "salinity",
            "region": "global",
            "region_bbox": None,
            "depth_mode": "mixed",
            "depth_range": [0.0, 100.0],
            "time_range": None,
            "confidence": 0.0,
            "semantic_matches": [],
        },
    )
    result = run_query("What is the average salinity from 0 to 100 meters?", _session())
    assert result["summary"]["layer"] == "sql"
    assert result["summary"]["fallback"]["status"] == "not-needed"
