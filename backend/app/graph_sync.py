"""Synchronize the relational observation model into Neo4j.

The sync is an idempotent job: nodes are keyed by stable IDs and relationships
use MERGE.  Every value is supplied as a Cypher parameter; no database value
is interpolated into a query string.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.neo4j_client import Neo4jGraphClient
from app.db.models import Float, Measurement, Profile


REGION_BOUNDS: dict[str, tuple[float, float, float, float]] = {
    "Somali coast": (-3.0, 15.0, 40.0, 55.0),
    "Arabian Sea": (8.0, 30.0, 30.0, 80.0),
    "Indian Ocean": (-40.0, 30.0, 20.0, 120.0),
}
ADJACENT_REGIONS = (
    ("Somali coast", "Arabian Sea"),
    ("Arabian Sea", "Indian Ocean"),
)
VARIABLES = ("temperature", "salinity", "oxygen", "chlorophyll")


@dataclass(frozen=True)
class GraphSyncResult:
    status: str
    floats: int = 0
    profiles: int = 0
    variables: int = 0
    anomalies: int = 0
    relationships: int = 0
    reason: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def region_for_coordinates(lat: float, lon: float) -> str:
    for name, (lat_min, lat_max, lon_min, lon_max) in REGION_BOUNDS.items():
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return name
    return "Global Ocean"


def _timestamp(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _write(client: Any, cypher: str, parameters: dict[str, Any]) -> None:
    execute = (
        getattr(client, "execute", None)
        or getattr(client, "run", None)
        or getattr(client, "query", None)
    )
    if execute is None:
        raise RuntimeError("graph-client-missing-execute")
    execute(cypher, parameters)


def _anomaly_rows(rows: list[tuple[Profile, Measurement]]) -> list[dict[str, Any]]:
    values: dict[str, list[tuple[Profile, Measurement, float]]] = defaultdict(list)
    for profile, measurement in rows:
        for variable in VARIABLES:
            value = getattr(measurement, variable)
            if value is not None and math.isfinite(float(value)):
                values[variable].append((profile, measurement, float(value)))
    anomalies: list[dict[str, Any]] = []
    for variable, observations in values.items():
        numeric = np.asarray([item[2] for item in observations], dtype=float)
        mean = float(numeric.mean()) if len(numeric) else 0.0
        std = float(numeric.std()) if len(numeric) else 0.0
        if std == 0:
            continue
        for profile, measurement, value in observations:
            z_score = (value - mean) / std
            if abs(z_score) >= 2.0:
                anomalies.append(
                    {
                        "id": f"{profile.profile_id}:{variable}:{measurement.depth}",
                        "profile_id": profile.profile_id,
                        "variable": variable,
                        "value": value,
                        "depth": float(measurement.depth),
                        "severity": abs(float(z_score)),
                        "timestamp": _timestamp(profile.timestamp),
                    }
                )
    return anomalies


def sync_graph(db: Session, graph_client: Any | None = None) -> GraphSyncResult:
    """Sync all Postgres-backed observations, returning a non-throwing status."""
    client = graph_client if graph_client is not None else Neo4jGraphClient()
    if not getattr(client, "available", False):
        return GraphSyncResult(status="unavailable", reason=getattr(client, "reason", "graph-unavailable"))
    try:
        rows = db.execute(
            select(Profile, Measurement, Float)
            .join(Measurement, Measurement.profile_id == Profile.profile_id)
            .join(Float, Float.float_id == Profile.float_id)
        ).all()
        profile_by_id: dict[str, Profile] = {}
        float_region: dict[str, str] = {}
        variable_names: set[str] = set()
        for profile, measurement, floating in rows:
            profile_by_id[profile.profile_id] = profile
            float_region[floating.float_id] = region_for_coordinates(profile.lat, profile.lon)
            variable_names.update(
                variable for variable in VARIABLES if getattr(measurement, variable) is not None
            )

        _write(
            client,
            "UNWIND $rows AS row MERGE (f:Float {id: row.id}) SET f.wmo_id = row.wmo_id",
            {
                "rows": [
                    {"id": floating.float_id, "wmo_id": floating.wmo_id}
                    for floating in {item[2].float_id: item[2] for item in rows}.values()
                ]
            },
        )
        _write(
            client,
            "UNWIND $rows AS row MERGE (p:Profile {id: row.id}) SET p.float_id = row.float_id, p.lat = row.lat, p.lon = row.lon, p.timestamp = row.timestamp",
            {
                "rows": [
                    {
                        "id": profile.profile_id,
                        "float_id": profile.float_id,
                        "lat": float(profile.lat),
                        "lon": float(profile.lon),
                        "timestamp": _timestamp(profile.timestamp),
                    }
                    for profile in profile_by_id.values()
                ]
            },
        )
        _write(
            client,
            "UNWIND $rows AS row MERGE (f:Float {id: row.float_id}) MERGE (p:Profile {id: row.profile_id}) MERGE (f)-[:RECORDED]->(p)",
            {"rows": [{"float_id": profile.float_id, "profile_id": profile.profile_id} for profile in profile_by_id.values()]},
        )
        regions = [{"name": name, "id": name} for name in set(float_region.values())]
        _write(
            client,
            "UNWIND $rows AS row MERGE (r:Region {id: row.id}) SET r.name = row.name",
            {"rows": regions},
        )
        _write(
            client,
            "UNWIND $rows AS row MERGE (f:Float {id: row.float_id}) MERGE (r:Region {id: row.region}) MERGE (f)-[:DEPLOYED_IN]->(r)",
            {"rows": [{"float_id": key, "region": value} for key, value in float_region.items()]},
        )
        _write(
            client,
            "UNWIND $rows AS row MERGE (p:Profile {id: row.profile_id}) MERGE (v:Variable {id: row.variable}) SET v.name = row.variable MERGE (p)-[:MEASURED]->(v)",
            {
                "rows": [
                    {"profile_id": profile.profile_id, "variable": variable}
                    for profile, measurement, _ in rows
                    for variable in VARIABLES
                    if getattr(measurement, variable) is not None
                ]
            },
        )
        _write(
            client,
            "UNWIND $rows AS row MERGE (a:Region {id: row.a}) MERGE (b:Region {id: row.b}) MERGE (a)-[:ADJACENT_TO]->(b) MERGE (b)-[:ADJACENT_TO]->(a)",
            {"rows": [{"a": a, "b": b} for a, b in ADJACENT_REGIONS if a in float_region.values() or b in float_region.values()]},
        )
        anomalies = _anomaly_rows([(profile, measurement) for profile, measurement, _ in rows])
        _write(
            client,
            "UNWIND $rows AS row MERGE (e:AnomalyEvent {id: row.id}) SET e.variable = row.variable, e.value = row.value, e.depth = row.depth, e.severity = row.severity, e.timestamp = row.timestamp MERGE (p:Profile {id: row.profile_id}) MERGE (e)-[:DETECTED_AT]->(p)",
            {"rows": anomalies},
        )
        relationship_count = len(profile_by_id) * 2 + len(variable_names) + len(anomalies)
        return GraphSyncResult(
            status="synced",
            floats=len(float_region),
            profiles=len(profile_by_id),
            variables=len(variable_names),
            anomalies=len(anomalies),
            relationships=relationship_count,
        )
    except Exception as exc:
        return GraphSyncResult(status="error", reason=type(exc).__name__)


sync_postgres_to_neo4j = sync_graph
