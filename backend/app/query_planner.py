"""Parameterized SQL query planning for structured oceanographic questions.

The semantic classifier is intentionally kept separate from this module.  It
provides candidate facets, while this planner recognizes a small set of
well-defined analytical intents and turns them into SQLAlchemy expressions.
Only whitelisted model columns are ever selected dynamically; all values are
bound parameters.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import Select, and_, bindparam, func, select
from sqlalchemy.orm import Session

from app.db.models import Measurement, Profile

SUPPORTED_VARIABLES = frozenset({"temperature", "salinity", "oxygen", "chlorophyll"})
Operation = Literal["extreme", "average", "compare"]

REGIONS: dict[str, tuple[str, list[float]]] = {
    "somali coast": ("Somali coast", [-3.0, 15.0, 40.0, 55.0]),
    "arabian sea": ("Arabian Sea", [8.0, 30.0, 30.0, 80.0]),
    "indian ocean": ("Indian Ocean", [-40.0, 30.0, 20.0, 120.0]),
    "north atlantic": ("North Atlantic", [0.0, 70.0, -80.0, 20.0]),
}


@dataclass(frozen=True)
class QueryPlan:
    """A safe SQLAlchemy statement and the intent used to interpret its rows."""

    statement: Select[Any]
    operation: Operation
    variable: str
    direction: Literal["asc", "desc"] | None = None
    filters: dict[str, Any] | None = None

    def debug_sql(self, session: Session | None = None) -> str:
        """Return SQL with placeholders, never literal bound values."""
        bind = getattr(session, "bind", None)
        compiled = self.statement.compile(
            bind=bind,
            compile_kwargs={"literal_binds": False},
        )
        return str(compiled)


@dataclass(frozen=True)
class PlannedResult:
    rows: list[dict[str, Any]]
    row_count: int


def _iso_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_date(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _iso_datetime(parsed)


def _normalize_float_id(value: str) -> str:
    value = value.strip()
    if value.lower().startswith("float-") or value.lower().startswith("float_"):
        return "float-" + value[6:]
    if value.isdigit():
        return f"float-{value}"
    return value


def _explicit_variable(question: str) -> str | None:
    lower = question.lower()
    aliases = {
        "temperature": r"\b(?:temperature|temp|thermal|heat)\b",
        "salinity": r"\b(?:salinity|salt|saline)\b",
        "oxygen": r"\b(?:oxygen|o2|dissolved oxygen)\b",
        "chlorophyll": r"\b(?:chlorophyll|chla|phytoplankton)\b",
    }
    for variable, pattern in aliases.items():
        if re.search(pattern, lower):
            return variable
    return None


def _explicit_region(question: str) -> tuple[str, list[float]] | None:
    lower = question.lower()
    for key, region in REGIONS.items():
        if key in lower:
            return region
    return None


def _explicit_depth_range(question: str) -> list[float] | None:
    # Prefer a numeric depth band over a semantic facet such as "deep".
    patterns = (
        r"(?:depth|depths|between)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:to|-|and)\s*(\d+(?:\.\d+)?)\s*(?:m|meter|meters|metre|metres)\b",
        r"(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:m|meter|meters|metre|metres)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, question.lower())
        if match:
            low, high = sorted((float(match.group(1)), float(match.group(2))))
            return [low, high]
    return None


def _explicit_time_range(question: str) -> dict[str, str] | None:
    dates = re.findall(r"\b\d{4}-\d{2}-\d{2}(?:[tT ][0-9:.+-]+)?\b", question)
    if len(dates) >= 2:
        start, end = (_parse_date(value) for value in dates[:2])
        if start is not None and end is not None:
            if start > end:
                start, end = end, start
            return {"start": start.isoformat(), "end": end.isoformat()}
    return None


def _lexical_depth_range(question: str) -> list[float] | None:
    lower = question.lower()
    if re.search(r"\b(?:deep|abyssal)\b", lower):
        return [500.0, 2000.0]
    if re.search(r"\b(?:surface|shallow|upper ocean)\b", lower):
        return [0.0, 100.0]
    if re.search(r"\b(?:mixed layer|mixed upper ocean)\b", lower):
        return [0.0, 500.0]
    if re.search(r"\bthermocline\b", lower):
        return [100.0, 500.0]
    return None


def _lexical_time_range(question: str) -> dict[str, str] | None:
    lower = question.lower()
    days = None
    if re.search(r"\b(?:last|past)\s+week\b|\bthis week\b", lower):
        days = 7
    elif re.search(r"\b(?:last|past)\s+month\b|\bthis month\b", lower):
        days = 30
    elif re.search(r"\b(?:last|past)\s+year\b|\bthis year\b", lower):
        days = 365
    elif re.search(r"\b(?:recent|latest|lately|currently|now)\b", lower):
        days = 30
    if days is None:
        return None
    end = datetime.now(timezone.utc)
    return {"start": (end - timedelta(days=days)).isoformat(), "end": end.isoformat()}


def _explicit_float_ids(question: str) -> tuple[str, str] | None:
    # Handles "between float 1 and float 2", "float-1 vs float-2", and
    # symbolic identifiers such as "float A and float B".
    patterns = (
        r"\bbetween\s+float[\s_-]*([a-z0-9]+)\s*(?:and|vs\.?|versus|/)\s*(?:float[\s_-]*)?([a-z0-9]+)\b",
        r"\bfloat[\s_-]*([a-z0-9]+)\s*(?:vs\.?|versus|and|/)\s*(?:float[\s_-]*)?([a-z0-9]+)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, question.lower())
        if match:
            return (_normalize_float_id(match.group(1)), _normalize_float_id(match.group(2)))
    return None


def _operation(question: str) -> tuple[Operation, Literal["asc", "desc"] | None] | None:
    lower = question.lower()
    if _explicit_float_ids(question) and re.search(r"\b(compare|difference|contrast|versus|vs\.?)\b", lower):
        return "compare", None
    if re.search(r"\b(?:warmest|hottest|warm|highest)\b", lower):
        return "extreme", "desc"
    if re.search(r"\b(?:coldest|coolest|lowest)\b", lower):
        return "extreme", "asc"
    if re.search(r"\b(?:average|avg|mean)\b", lower):
        return "average", None
    return None


def _effective_filters(question: str, topic: dict[str, Any]) -> dict[str, Any]:
    """Overlay lexical, explicit constraints on top of semantic facets."""
    filters = dict(topic)
    variable = _explicit_variable(question)
    if variable:
        filters["variable"] = variable
    region = _explicit_region(question)
    if region:
        filters["region"], filters["region_bbox"] = region
    depth_range = _explicit_depth_range(question)
    if depth_range:
        filters["depth_range"] = depth_range
    elif not filters.get("depth_range"):
        depth_range = _lexical_depth_range(question)
        if depth_range:
            filters["depth_range"] = depth_range
    time_range = _explicit_time_range(question)
    if time_range:
        filters["time_range"] = time_range
    elif not filters.get("time_range"):
        time_range = _lexical_time_range(question)
        if time_range:
            filters["time_range"] = time_range
    return filters


def _apply_filters(statement: Select[Any], filters: dict[str, Any]) -> Select[Any]:
    conditions = []
    bbox = filters.get("region_bbox")
    if bbox and len(bbox) == 4:
        conditions.extend(
            (
                Profile.lat >= bindparam("region_lat_min", value=float(bbox[0])),
                Profile.lat <= bindparam("region_lat_max", value=float(bbox[1])),
                Profile.lon >= bindparam("region_lon_min", value=float(bbox[2])),
                Profile.lon <= bindparam("region_lon_max", value=float(bbox[3])),
            )
        )
    depth_range = filters.get("depth_range")
    if depth_range and len(depth_range) == 2:
        conditions.extend(
            (
                Measurement.depth >= bindparam("depth_min", value=float(depth_range[0])),
                Measurement.depth <= bindparam("depth_max", value=float(depth_range[1])),
            )
        )
    time_range = filters.get("time_range")
    if time_range:
        start = _parse_date(str(time_range["start"]))
        end = _parse_date(str(time_range["end"]))
        if start is not None and end is not None:
            conditions.extend(
                (
                    Profile.timestamp >= bindparam("time_start", value=start),
                    Profile.timestamp <= bindparam("time_end", value=end),
                )
            )
    return statement.where(and_(*conditions)) if conditions else statement


def plan_query(question: str, topic: dict[str, Any] | None = None) -> QueryPlan | None:
    """Plan a supported analytical question, or return ``None`` for fallback."""
    topic = topic or {}
    operation_info = _operation(question)
    if operation_info is None:
        return None
    operation, direction = operation_info
    filters = _effective_filters(question, topic)
    variable = filters.get("variable")
    if variable not in SUPPORTED_VARIABLES:
        return None
    metric = getattr(Measurement, variable)

    if operation == "extreme":
        # An extreme must be scoped to a named region; otherwise the existing
        # profile retrieval fallback remains the safer behavior.
        if not filters.get("region_bbox"):
            return None
        statement = select(
            Profile.profile_id,
            Profile.float_id,
            Profile.lat,
            Profile.lon,
            Profile.timestamp,
            func.avg(metric).label("value"),
        ).select_from(Profile).join(Measurement, Measurement.profile_id == Profile.profile_id)
        statement = _apply_filters(statement, filters).group_by(
            Profile.profile_id, Profile.float_id, Profile.lat, Profile.lon, Profile.timestamp
        )
        statement = statement.order_by(
            getattr(func.avg(metric), "desc" if direction == "desc" else "asc")()
        ).limit(1)
        return QueryPlan(statement, operation, variable, direction, filters)

    if operation == "average":
        # Do not turn an unconstrained "average temperature" into an
        # expensive all-history query.  The fallback owns open-ended prompts.
        has_depth = bool(
            _explicit_depth_range(question)
            or re.search(r"\b(depth|surface|deep|thermocline|shallow|mixed layer)\b", question.lower())
        )
        has_time = bool(
            filters.get("time_range")
            or _explicit_time_range(question)
            or _lexical_time_range(question)
            or re.search(
                r"\b(?:recent|latest|last|past|since|year|month|week|time)\b"
                r"|\b\d{4}-\d{2}-\d{2}\b",
                question.lower(),
            )
        )
        if has_depth and not filters.get("depth_range"):
            return None
        if has_time and not filters.get("time_range"):
            return None
        if not (has_depth or has_time):
            return None
        statement = select(
            func.avg(metric).label("value"),
            func.count(metric).label("sample_count"),
        ).select_from(Profile).join(Measurement, Measurement.profile_id == Profile.profile_id)
        statement = _apply_filters(statement, filters)
        return QueryPlan(statement, operation, variable, filters=filters)

    float_ids = _explicit_float_ids(question)
    if not float_ids:
        return None
    statement = select(
        Profile.float_id,
        func.avg(metric).label("value"),
        func.count(metric).label("sample_count"),
    ).select_from(Profile).join(Measurement, Measurement.profile_id == Profile.profile_id)
    statement = _apply_filters(statement, filters).where(
        Profile.float_id.in_(bindparam("float_ids", value=list(float_ids), expanding=True))
    )
    statement = statement.group_by(Profile.float_id).order_by(Profile.float_id)
    return QueryPlan(statement, operation, variable, filters=filters)


def execute_query_plan(plan: QueryPlan, db: Session) -> PlannedResult:
    """Execute a plan and normalize SQLAlchemy rows for API serialization."""
    result = db.execute(plan.statement)
    rows: list[dict[str, Any]] = []
    for row in result.mappings():
        normalized: dict[str, Any] = {}
        for key, value in row.items():
            normalized[key] = value.isoformat() if isinstance(value, datetime) else value
        if normalized.get("value") is None:
            continue
        rows.append(normalized)
    return PlannedResult(rows=rows, row_count=len(rows))
