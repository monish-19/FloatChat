"""A lazy, optional Neo4j client.

Importing FloatChat never requires a running Neo4j server.  Connections are
created lazily and all connection/query errors are converted into an
unavailable result so the SQL and semantic paths remain usable.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any


def _enabled(value: str | None) -> bool:
    return (value or "true").strip().lower() not in {"0", "false", "no", "off"}


class Neo4jGraphClient:
    """Small wrapper exposing only parameterized read/write queries."""

    provider = "neo4j"

    def __init__(
        self,
        *,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
        database: str | None = None,
    ) -> None:
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USER", "neo4j")
        self.password = password if password is not None else os.getenv("NEO4J_PASSWORD", "floatchat")
        self.database = database or os.getenv("NEO4J_DATABASE", "neo4j")
        self._driver: Any = None
        self.reason: str | None = None
        if not _enabled(os.getenv("NEO4J_ENABLED")):
            self.reason = "disabled"
            return
        try:
            from neo4j import GraphDatabase  # type: ignore

            self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        except Exception:
            self.reason = "dependency-unavailable"

    @property
    def available(self) -> bool:
        return self._driver is not None

    def execute(self, cypher: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        """Run a parameterized Cypher query and return plain dictionaries."""
        if not self.available:
            raise RuntimeError(self.reason or "graph-unavailable")
        params = dict(parameters or {})
        try:
            records, _, _ = self._driver.execute_query(
                cypher,
                parameters_=params,
                database_=self.database,
            )
            return [record.data() for record in records]
        except AttributeError:
            # Compatibility with older Neo4j Python drivers and simple mocks.
            with self._driver.session(database=self.database) as session:
                return [record.data() for record in session.run(cypher, **params)]

    def run(self, cypher: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        return self.execute(cypher, parameters)

    def query(self, cypher: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        return self.execute(cypher, parameters)

    def close(self) -> None:
        if self._driver is not None:
            self._driver.close()


Neo4jClient = Neo4jGraphClient
