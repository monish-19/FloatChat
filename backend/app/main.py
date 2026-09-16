from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agent.orchestrator import orchestrate_query
from app.db.models import Measurement, Profile
from app.db.session import get_db
from app.graph_sync import sync_graph
from app.ingestion.argo_pull import ingest_argo
from app.llm_client import create_llm_client
from app.metrics import metrics_snapshot, persist_run
from app.query_planner import execute_query_plan, plan_query
from app.search.semantic_index import classify_question

load_dotenv()
LOGGER = logging.getLogger(__name__)
app = FastAPI(title="FloatChat API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PARQUET_DIR = Path(__file__).resolve().parents[1] / "data" / "parquet"


class QueryRequest(BaseModel):
    question: str = Field(..., description="Natural-language oceanographic question")


class QueryResponse(BaseModel):
    answer: str
    match_count: int
    summary: Dict[str, Any]
    latency: Dict[str, float]


def infer_topic(question: str, db: Session | None = None) -> Dict[str, Any]:
    """Classify a question semantically, with a lexical fallback when needed."""
    # A database lets the classifier lazily build the persisted index on the
    # first query when ingestion has not created it yet.
    return classify_question(question, db=db)


def profile_matches(db: Session, topic: Dict[str, Any], question: str) -> list[dict[str, Any]]:
    rows = db.execute(select(Profile, Measurement).join(Measurement, Measurement.profile_id == Profile.profile_id)).all()
    grouped: dict[str, dict[str, Any]] = {}
    variable = topic["variable"]
    for profile, measurement in rows:
        bbox = topic.get("region_bbox")
        if bbox and not (bbox[0] <= profile.lat <= bbox[1] and bbox[2] <= profile.lon <= bbox[3]):
            continue
        time_range = topic.get("time_range")
        if time_range:
            profile_time = profile.timestamp
            if profile_time.tzinfo is None:
                profile_time = profile_time.replace(tzinfo=timezone.utc)
            start = datetime.fromisoformat(time_range["start"])
            end = datetime.fromisoformat(time_range["end"])
            if not (start <= profile_time <= end):
                continue
        entry = grouped.setdefault(
            profile.profile_id,
            {"id": profile.profile_id, "lat": profile.lat, "lon": profile.lon, "timestamp": profile.timestamp.isoformat(), "values": []},
        )
        value = getattr(measurement, variable)
        if value is not None:
            entry["values"].append((measurement.depth, value))
    matches = []
    for entry in grouped.values():
        values = sorted(entry["values"])
        if not values:
            continue
        depth_range = topic.get("depth_range")
        if depth_range:
            values = [(depth, value) for depth, value in values if depth_range[0] <= depth <= depth_range[1]]
        if not values:
            continue
        selected = values[-8:] if topic["depth_mode"] == "deep" else values[:8] if topic["depth_mode"] == "surface" else values[:20]
        matches.append({**{key: entry[key] for key in ("id", "lat", "lon", "timestamp")}, f"{variable}_mean": round(float(np.mean([value for _, value in selected])), 3)})
    return sorted(matches, key=lambda item: item[f"{variable}_mean"], reverse=True)[:5]


def _insufficient_data(reason: str | None = None) -> str:
    message = "Insufficient data to provide a grounded answer from the available FloatChat observations."
    if reason:
        message += f" {reason}"
    return message


def _fallback_prompt(
    question: str,
    topic: Dict[str, Any],
    semantic_matches: list[dict[str, Any]],
    partial_sql: str | None,
    fallback_rows: list[dict[str, Any]],
) -> str:
    evidence = {
        "question": question,
        "semantic_matches": semantic_matches[:8],
        "partial_sql": partial_sql,
        "fallback_results": fallback_rows[:8],
        "filters": {
            key: value
            for key, value in topic.items()
            if key in {"variable", "region", "depth_mode", "depth_range", "time_range", "confidence"}
        },
    }
    return (
        "Answer the question using only this JSON evidence. Give a concise answer and mention "
        "the relevant values or profiles when present. Do not add facts not present in the "
        "evidence. If the evidence is insufficient, explicitly say 'insufficient data'.\n\n"
        + json.dumps(evidence, separators=(",", ":"), default=str)
    )


def _run_standard_query(question: str, db: Session, llm_client: Any | None = None) -> Dict[str, Any]:
    semantic_start = time.perf_counter()
    topic = infer_topic(question, db)
    semantic_ms = (time.perf_counter() - semantic_start) * 1000
    semantic_timings = topic.pop("_timings", {}) if isinstance(topic, dict) else {}
    planner = plan_query(question, topic)
    planner_start = time.perf_counter()
    planned = execute_query_plan(planner, db) if planner else None
    sql_ms = (time.perf_counter() - planner_start) * 1000 if planner else 0.0
    retrieval_start = time.perf_counter()
    ordered = profile_matches(db, topic, question) if planned is None else planned.rows
    retrieval_ms = (time.perf_counter() - retrieval_start) * 1000 if planned is None else 0.0
    row_count = planned.row_count if planned is not None else len(ordered)
    debug_query = planner.debug_sql(db) if planner else None
    llm_start = time.perf_counter()
    fallback: Dict[str, Any] = {
        "attempted": False,
        "provider": None,
        "status": "not-needed" if planner else "not-attempted",
        "reason": None,
    }
    layer = "sql" if planner else "semantic-only"
    if planner:
        if not ordered:
            answer = "No data matched the requested range. Try a broader question or a different depth band."
        elif planner.operation == "average":
            value = ordered[0].get("value")
            samples = ordered[0].get("sample_count", 0)
            answer = f"The average {planner.variable} in the requested range is {round(float(value), 3)} across {samples} samples."
        elif planner.operation == "compare":
            values = ", ".join(f"{row['float_id']}: {round(float(row['value']), 3)}" for row in ordered)
            answer = f"The requested {planner.variable} comparison is {values}."
        else:
            top = ordered[0]
            value = round(float(top["value"]), 3)
            qualifier = "warmest" if planner.direction == "desc" else "coldest"
            answer = f"The {qualifier} {planner.variable} profile is near {top['lat']}°N, {top['lon']}°E, averaging {value} in the requested range."
    else:
        if not ordered:
            fallback["status"] = "no-data"
            fallback["reason"] = "no-semantic-results"
            answer = _insufficient_data("No matching observations were retrieved.")
        else:
            fallback["attempted"] = True
            client = llm_client if llm_client is not None else create_llm_client()
            provider = getattr(client, "provider", "unknown")
            fallback["provider"] = provider
            if not getattr(client, "available", False):
                reason = getattr(client, "reason", None) or "client-unavailable"
                fallback["status"] = "unavailable"
                fallback["reason"] = reason
                LOGGER.warning("LLM fallback unavailable provider=%s reason=%s", provider, reason)
                answer = _insufficient_data("A grounded language-model fallback is unavailable.")
            else:
                prompt = _fallback_prompt(
                    question,
                    topic,
                    topic.get("semantic_matches", []),
                    debug_query or "No supported SQL plan; semantic profile retrieval fallback was used.",
                    ordered,
                )
                try:
                    complete = getattr(client, "complete", None) or getattr(client, "generate", None)
                    if complete is None:
                        raise RuntimeError("client-missing-completion-method")
                    answer = complete(prompt)
                    if not isinstance(answer, str) or not answer.strip():
                        raise RuntimeError("empty-response")
                    answer = answer.strip()
                    fallback["status"] = "generated"
                    layer = "llm-fallback"
                except Exception as exc:
                    fallback["status"] = "failed"
                    fallback["reason"] = type(exc).__name__
                    LOGGER.warning("LLM fallback failed provider=%s error=%s", provider, type(exc).__name__)
                    answer = _insufficient_data("The grounded language-model fallback failed.")
    llm_ms = (time.perf_counter() - llm_start) * 1000
    LOGGER.info("query_response layer=%s match_count=%d", layer, len(ordered))
    return {
        "answer": answer,
        "match_count": len(ordered),
        "summary": {
            **topic,
            "samples": ordered[:3],
            "planner": planner.operation if planner else "fallback",
            "layer": layer,
            "query": debug_query,
            "row_count": row_count,
            "fallback": fallback,
        },
        "latency": {
            "embedding_ms": round(float(semantic_timings.get("embedding_ms", semantic_ms)), 2),
            "faiss_ms": round(float(semantic_timings.get("faiss_ms", 0.0)), 2),
            "retrieval_ms": round(retrieval_ms, 2),
            "sql_ms": round(sql_ms, 2),
            "graph_ms": 0.0,
            "llm_ms": round(llm_ms, 2),
            "fallback_ms": round(llm_ms, 2) if not planner else 0.0,
            "total_ms": round(semantic_ms + retrieval_ms + sql_ms + llm_ms, 2),
        },
    }


def run_query(
    question: str,
    db: Session,
    llm_client: Any | None = None,
    graph_client: Any | None = None,
) -> Dict[str, Any]:
    """Run the existing query pipeline, adding optional graph orchestration."""
    started = time.perf_counter()
    result = orchestrate_query(
        question,
        db,
        llm_client=llm_client,
        graph_client=graph_client,
        fallback_runner=_run_standard_query,
    )
    # Wall-clock time is measured around the entire orchestration, rather than
    # reconstructed from layers, so planner/serialization/graph overhead is
    # included and the persisted benchmark remains accurate.
    result.setdefault("latency", {})["total_ms"] = round((time.perf_counter() - started) * 1000, 2)
    persist_run(db, question, result)
    return result


def write_parquet_snapshot(db: Session) -> None:
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)
    rows = db.execute(select(Profile, Measurement).join(Measurement, Measurement.profile_id == Profile.profile_id)).all()
    measurements = []
    profiles = {}
    for profile, measurement in rows:
        profiles[profile.profile_id] = {
            "profile_id": profile.profile_id,
            "float_id": profile.float_id,
            "timestamp": profile.timestamp,
            "lat": profile.lat,
            "lon": profile.lon,
        }
        measurements.append(
            {
                "profile_id": measurement.profile_id,
                "depth": measurement.depth,
                "temperature": measurement.temperature,
                "salinity": measurement.salinity,
                "oxygen": measurement.oxygen,
                "chlorophyll": measurement.chlorophyll,
                "qc_flag": measurement.qc_flag,
            }
        )
    pd.DataFrame(measurements).to_parquet(PARQUET_DIR / "latest_measurements.parquet", index=False)
    pd.DataFrame(profiles.values()).to_parquet(PARQUET_DIR / "latest_profiles.parquet", index=False)


@app.get("/health")
def health(db: Session = Depends(get_db)) -> Dict[str, Any]:
    profiles = db.scalar(select(func.count()).select_from(Profile)) or 0
    return {"status": "ok", "service": "FloatChat backend", "profiles": profiles, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/floats")
def floats(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return float identifiers available for the map without fabricating telemetry."""
    float_ids = db.scalars(select(Profile.float_id).distinct().order_by(Profile.float_id)).all()
    return {"float_ids": list(float_ids)}


@app.get("/floats/{float_id}/trajectory")
def float_trajectory(float_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return the observed path and measurements for one float."""
    rows = db.execute(
        select(Profile, Measurement)
        .join(Measurement, Measurement.profile_id == Profile.profile_id)
        .where(Profile.float_id == float_id)
        .order_by(Profile.timestamp, Measurement.depth)
    ).all()
    path = [
        {
            "profile_id": profile.profile_id,
            "lat": float(profile.lat),
            "lon": float(profile.lon),
            "depth": float(measurement.depth),
            "timestamp": profile.timestamp.isoformat(),
            "temperature": float(measurement.temperature) if measurement.temperature is not None else None,
            "salinity": float(measurement.salinity) if measurement.salinity is not None else None,
            "oxygen": float(measurement.oxygen) if measurement.oxygen is not None else None,
            "chlorophyll": float(measurement.chlorophyll) if measurement.chlorophyll is not None else None,
            "qc_flag": measurement.qc_flag,
        }
        for profile, measurement in rows
    ]
    return {"float_id": float_id, "path": path}


@app.post("/ingest")
def ingest(db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        result = ingest_argo(db)
        write_parquet_snapshot(db)
        graph = sync_graph(db)
        return {"status": "ingested", "profiles_ingested": result.profiles, "last_hour": result.profiles, "measurements_ingested": result.measurements, "graph_sync": graph.as_dict(), "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        db.rollback()
        return {"status": "error", "profiles_ingested": 0, "last_hour": 0, "measurements_ingested": 0, "timestamp": datetime.now(timezone.utc).isoformat(), "error": str(exc)}


@app.post("/query", response_model=QueryResponse)
def query(payload: QueryRequest, db: Session = Depends(get_db)) -> QueryResponse:
    return QueryResponse(**run_query(payload.question, db))


@app.get("/metrics")
def metrics(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return live p50/p95 timings and the most recent measured runs."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **metrics_snapshot(db),
    }


@app.get("/anomalies")
def anomalies(db: Session = Depends(get_db)) -> Dict[str, Any]:
    path = PARQUET_DIR / "latest_measurements.parquet"
    profiles_path = PARQUET_DIR / "latest_profiles.parquet"
    if not path.exists():
        path = PARQUET_DIR / "seed_measurements.parquet"
        profiles_path = PARQUET_DIR / "seed_profiles.parquet"
    if path.exists():
        measurements = pd.read_parquet(path)
        profiles = pd.read_parquet(profiles_path)
        data = measurements.merge(profiles, on="profile_id")
    else:
        rows = db.execute(select(Profile, Measurement).join(Measurement, Measurement.profile_id == Profile.profile_id)).all()
        data = pd.DataFrame([{"float_id": profile.float_id, "lat": profile.lat, "lon": profile.lon, "depth": measurement.depth, "temperature": measurement.temperature, "timestamp": profile.timestamp} for profile, measurement in rows])
    events: List[Dict[str, Any]] = []
    for profile_id, group in data.groupby("profile_id"):
        values = group["temperature"].to_numpy(dtype=float)
        z_scores = (values - values.mean()) / (values.std() or 1.0)
        for index, score in enumerate(z_scores):
            if abs(score) > 2.4:
                row = group.iloc[index]
                events.append({"float_id": row.get("float_id", profile_id), "lat": row["lat"], "lon": row["lon"], "depth": round(float(row["depth"]), 1), "variable": "temperature", "severity": round(float(abs(score)), 2), "time": pd.Timestamp(row.get("timestamp")).isoformat()})
    return {"events": events[:25], "count": len(events[:25])}


@app.get("/transect")
def transect(
    variable: str = Query("temperature", pattern="^(temperature|salinity)$"),
    float_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Build a real section from observed profiles, with nulls for unsampled cells."""
    statement = (
        select(Profile, Measurement)
        .join(Measurement, Measurement.profile_id == Profile.profile_id)
        .order_by(Profile.timestamp, Measurement.depth)
    )
    if float_id:
        statement = statement.where(Profile.float_id == float_id)
    rows = db.execute(statement).all()
    if not rows:
        return {
            "variable": variable,
            "start": {"lat": 0, "lon": 0},
            "end": {"lat": 0, "lon": 0},
            "distance_km": [],
            "depths": [],
            "grid": [],
        }

    profiles: dict[str, dict[str, Any]] = {}
    for profile, measurement in rows:
        entry = profiles.setdefault(
            profile.profile_id,
            {"lat": float(profile.lat), "lon": float(profile.lon), "values": {}},
        )
        value = getattr(measurement, variable)
        if value is not None:
            entry["values"][round(float(measurement.depth), 1)] = float(value)
    ordered_profiles = list(profiles.values())
    if not ordered_profiles:
        return {"variable": variable, "start": {"lat": 0, "lon": 0}, "end": {"lat": 0, "lon": 0}, "distance_km": [], "depths": [], "grid": []}

    distances = [0.0]
    for previous, current in zip(ordered_profiles, ordered_profiles[1:]):
        lat1, lat2 = radians(previous["lat"]), radians(current["lat"])
        dlat = lat2 - lat1
        dlon = radians(current["lon"] - previous["lon"])
        haversine = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        distances.append(distances[-1] + 6371.0 * 2 * asin(sqrt(min(1.0, haversine))))

    column_count = min(len(ordered_profiles), 80)
    column_indices = sorted(set(int(index) for index in np.linspace(0, len(ordered_profiles) - 1, column_count)))
    selected_profiles = [ordered_profiles[index] for index in column_indices]
    selected_distances = [distances[index] for index in column_indices]
    depth_values = sorted({depth for profile in selected_profiles for depth in profile["values"]})
    if len(depth_values) > 48:
        depth_indices = sorted(set(int(index) for index in np.linspace(0, len(depth_values) - 1, 48)))
        depth_values = [depth_values[index] for index in depth_indices]
    grid = [
        {"depth": depth, "values": [profile["values"].get(depth) for profile in selected_profiles]}
        for depth in depth_values
    ]
    return {
        "variable": variable,
        "start": {"lat": ordered_profiles[0]["lat"], "lon": ordered_profiles[0]["lon"]},
        "end": {"lat": ordered_profiles[-1]["lat"], "lon": ordered_profiles[-1]["lon"]},
        "distance_km": [round(distance, 2) for distance in selected_distances],
        "depths": depth_values,
        "grid": grid,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
