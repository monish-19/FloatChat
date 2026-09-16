"""Coordinate semantic, SQL, graph, and grounded-LLM query layers."""

from __future__ import annotations

import json
import time
from typing import Any, Callable

from app.agent.graph_retrieval import ANOMALY_SIMILARITY_CYPHER, GraphRetriever
from app.agent.intent import detect_query_intent
from app.agent.neo4j_client import Neo4jGraphClient


def _graph_answer(question: str, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "No graph-linked anomaly similarities matched the requested question."
    first = rows[0]
    variable = first.get("variable") or "measurement"
    pair_count = len(rows)
    region = first.get("region") or "the observed region"
    return (
        f"Found {pair_count} graph-linked {variable} anomaly similarity "
        f"{'relationship' if pair_count == 1 else 'relationships'} near {region}."
    )


def _graph_prompt(question: str, rows: list[dict[str, Any]]) -> str:
    return (
        "Answer using only this graph evidence. Do not invent observations. "
        "If it is insufficient, say 'insufficient data'.\n"
        + json.dumps({"question": question, "graph_results": rows[:12]}, default=str)
    )


def _try_llm(llm_client: Any, prompt: str) -> str | None:
    if not getattr(llm_client, "available", False):
        return None
    complete = getattr(llm_client, "complete", None) or getattr(llm_client, "generate", None)
    if complete is None:
        return None
    try:
        answer = complete(prompt)
        return answer.strip() if isinstance(answer, str) and answer.strip() else None
    except Exception:
        return None


def orchestrate_query(
    question: str,
    db: Any,
    *,
    llm_client: Any | None = None,
    graph_client: Any | None = None,
    fallback_runner: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    """Run graph retrieval when needed, otherwise delegate to existing phases."""
    intent = detect_query_intent(question)
    if not intent.graph_required:
        return fallback_runner(question, db, llm_client=llm_client)

    started = time.perf_counter()
    client = graph_client if graph_client is not None else Neo4jGraphClient()
    if not getattr(client, "available", False):
        return fallback_runner(question, db, llm_client=llm_client)
    try:
        rows = GraphRetriever(client).retrieve_anomaly_similarity(variable=intent.variable)
    except Exception:
        # A missing/unreachable graph must not make /query unavailable.
        return fallback_runner(question, db, llm_client=llm_client)

    graph_ms = (time.perf_counter() - started) * 1000
    llm_started = time.perf_counter()
    llm_answer = _try_llm(llm_client, _graph_prompt(question, rows)) if llm_client is not None else None
    llm_ms = (time.perf_counter() - llm_started) * 1000
    layer = "graph+llm" if llm_answer else "graph"
    answer = llm_answer or _graph_answer(question, rows)
    return {
        "answer": answer,
        "match_count": len(rows),
        "summary": {
            "intent": intent.kind,
            "variable": intent.variable,
            "region": "global",
            "region_bbox": None,
            "depth_mode": "mixed",
            "depth_range": None,
            "time_range": None,
            "confidence": 1.0,
            "semantic_matches": [],
            "samples": rows[:3],
            "planner": "graph",
            "layer": layer,
            "query": ANOMALY_SIMILARITY_CYPHER,
            "row_count": len(rows),
            "graph": {
                "available": True,
                "result_count": len(rows),
                "retrieval_ms": round(graph_ms, 2),
            },
            "fallback": {
                "attempted": bool(llm_client is not None),
                "provider": getattr(llm_client, "provider", None) if llm_client else None,
                "status": "generated" if llm_answer else "not-needed",
                "reason": None,
            },
        },
        "latency": {
            "embedding_ms": 0.0,
            "faiss_ms": 0.0,
            "retrieval_ms": 0.0,
            "sql_ms": 0.0,
            "graph_ms": round(graph_ms, 2),
            "llm_ms": round(llm_ms, 2),
            "fallback_ms": round(llm_ms, 2) if llm_answer else 0.0,
            "total_ms": round(graph_ms, 2),
        },
    }
