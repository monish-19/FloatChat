"""Parameterized Cypher retrieval for multi-hop anomaly questions."""

from __future__ import annotations

from typing import Any

ANOMALY_SIMILARITY_CYPHER = """
MATCH (event:AnomalyEvent)-[:DETECTED_AT]->(profile:Profile)
      <-[:RECORDED]-(float:Float)-[:DEPLOYED_IN]->(region:Region)
OPTIONAL MATCH (region)-[:ADJACENT_TO]-(adjacent:Region)
      <-[:DEPLOYED_IN]-(neighbor_float:Float)-[:RECORDED]->(neighbor:Profile)
      <-[:DETECTED_AT]-(neighbor_event:AnomalyEvent)
WHERE ($variable IS NULL OR event.variable = $variable)
  AND ($variable IS NULL OR neighbor_event.variable = $variable)
  AND event.id <> neighbor_event.id
  AND abs(coalesce(event.severity, 0.0) - coalesce(neighbor_event.severity, 0.0)) <= $severity_tolerance
RETURN event.id AS anomaly_id,
       event.variable AS variable,
       event.severity AS severity,
       profile.id AS profile_id,
       float.id AS float_id,
       region.name AS region,
       neighbor_event.id AS similar_anomaly_id,
       neighbor.id AS similar_profile_id,
       neighbor_float.id AS similar_float_id,
       adjacent.name AS adjacent_region
ORDER BY severity DESC
LIMIT $limit
"""


class GraphRetriever:
    def __init__(self, client: Any):
        self.client = client

    def retrieve_anomaly_similarity(
        self,
        *,
        variable: str | None = None,
        limit: int = 10,
        severity_tolerance: float = 0.75,
    ) -> list[dict[str, Any]]:
        params = {
            "variable": variable,
            "limit": max(1, min(int(limit), 50)),
            "severity_tolerance": float(severity_tolerance),
        }
        execute = (
            getattr(self.client, "execute", None)
            or getattr(self.client, "run", None)
            or getattr(self.client, "query", None)
        )
        if execute is None:
            raise RuntimeError("graph-client-missing-execute")
        result = execute(ANOMALY_SIMILARITY_CYPHER, params)
        return [dict(row) for row in (result or [])]
