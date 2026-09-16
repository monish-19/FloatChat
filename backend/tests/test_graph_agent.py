from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.agent.graph_retrieval import ANOMALY_SIMILARITY_CYPHER, GraphRetriever
from app.agent.intent import detect_query_intent
from app.db.models import Base, Float, Measurement, Profile
from app.graph_sync import sync_graph
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
    db.add(Measurement(profile_id="p-1", depth=10, temperature=20))
    db.commit()
    return db


class FakeGraph:
    available = True

    def __init__(self):
        self.cypher = ""
        self.parameters = {}

    def execute(self, cypher, parameters):
        self.cypher = cypher
        self.parameters = parameters
        return [
            {
                "anomaly_id": "a-1",
                "variable": "temperature",
                "severity": 2.4,
                "profile_id": "p-1",
                "float_id": "float-1",
                "region": "Arabian Sea",
                "similar_anomaly_id": "a-2",
                "similar_profile_id": "p-2",
                "similar_float_id": "float-2",
                "adjacent_region": "Indian Ocean",
            }
        ]


class RecordingGraph:
    available = True

    def __init__(self):
        self.calls = []

    def execute(self, cypher, parameters):
        self.calls.append((cypher, parameters))
        return []


def test_intent_detects_multi_hop_anomaly_similarity():
    intent = detect_query_intent("Which floats have similar temperature anomalies in adjacent regions?")
    assert intent.graph_required is True
    assert intent.kind == "anomaly_similarity"
    assert intent.variable == "temperature"


def test_graph_retrieval_uses_parameters():
    graph = FakeGraph()
    rows = GraphRetriever(graph).retrieve_anomaly_similarity(variable="oxygen")
    assert rows[0]["similar_float_id"] == "float-2"
    assert "$variable" in graph.cypher
    assert "oxygen" not in graph.cypher
    assert graph.parameters["variable"] == "oxygen"


def test_query_uses_graph_layer_without_network():
    graph = FakeGraph()
    result = run_query(
        "Find similar temperature anomalies in adjacent regions",
        _session(),
        graph_client=graph,
    )
    assert result["summary"]["layer"] == "graph"
    assert result["summary"]["graph"]["result_count"] == 1
    assert result["match_count"] == 1
    assert ANOMALY_SIMILARITY_CYPHER


def test_graph_sync_writes_required_relationships_without_network():
    graph = RecordingGraph()
    result = sync_graph(_session(), graph_client=graph)
    assert result.status == "synced"
    cypher = "\n".join(call[0] for call in graph.calls)
    assert "DEPLOYED_IN" in cypher
    assert "RECORDED" in cypher
    assert "MEASURED" in cypher
    assert "ADJACENT_TO" in cypher
    assert "DETECTED_AT" in cypher
    assert all("$" in query for query, _ in graph.calls)
