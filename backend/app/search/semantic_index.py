"""FAISS-backed semantic indexing for profile metadata.

The index deliberately contains only metadata that already exists in the
database.  It never creates observations or synthetic profiles.  The model is
loaded lazily so the API can still start and use the keyword fallback while a
deployment is installing/downloading the embedding model.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Measurement, Profile

LOGGER = logging.getLogger(__name__)
MODEL_NAME = os.getenv("FLOATCHAT_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
INDEX_DIR = Path(__file__).resolve().parents[2] / "data" / "faiss"
INDEX_PATH = INDEX_DIR / "profiles.index"
METADATA_PATH = INDEX_DIR / "metadata.json"
INDEX_VERSION = 1
DEFAULT_TOP_K = 8
CLASSIFICATION_TOP_K = 64
SEMANTIC_CONFIDENCE_THRESHOLD = float(os.getenv("FLOATCHAT_SEMANTIC_THRESHOLD", "0.36"))

_MODEL: Any = None
_MODEL_LOCK = threading.Lock()


def _load_dependencies() -> tuple[Any, Any]:
    """Import optional native dependencies only when semantic search is used."""
    try:
        import faiss  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "Semantic search requires sentence-transformers and faiss-cpu; "
            "the keyword classifier will be used until they are installed."
        ) from exc
    return faiss, SentenceTransformer


def _model() -> Any:
    global _MODEL
    if _MODEL is None:
        with _MODEL_LOCK:
            if _MODEL is None:
                _, sentence_transformer = _load_dependencies()
                _MODEL = sentence_transformer(MODEL_NAME)
    return _MODEL


def _encode(texts: Iterable[str]) -> np.ndarray:
    values = list(texts)
    if not values:
        return np.empty((0, 0), dtype="float32")
    vectors = _model().encode(values, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False)
    return np.asarray(vectors, dtype="float32")


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _facet_records() -> list[dict[str, Any]]:
    """Static semantic labels used to turn a question into structured filters."""
    return [
        {"id": "facet:variable:temperature", "kind": "variable", "value": "temperature", "text": "temperature warm heat hot cold thermal warming ocean water temperature"},
        {"id": "facet:variable:salinity", "kind": "variable", "value": "salinity", "text": "salinity salt salty saltiness freshwater ocean water"},
        {"id": "facet:variable:oxygen", "kind": "variable", "value": "oxygen", "text": "dissolved oxygen oxygen O2 hypoxia deoxygenation breathing marine water"},
        {"id": "facet:variable:chlorophyll", "kind": "variable", "value": "chlorophyll", "text": "chlorophyll phytoplankton algae productivity ocean biology"},
        {"id": "facet:region:somali_coast", "kind": "region", "value": "Somali coast", "bbox": [-3.0, 15.0, 40.0, 55.0], "text": "Somali coast Somalia Horn of Africa waters western Indian Ocean offshore Somalia"},
        {"id": "facet:region:arabian_sea", "kind": "region", "value": "Arabian Sea", "bbox": [8.0, 30.0, 30.0, 80.0], "text": "Arabian Sea northern western Indian Ocean Oman Pakistan India Somalia"},
        {"id": "facet:region:indian_ocean", "kind": "region", "value": "Indian Ocean", "bbox": [-40.0, 30.0, 20.0, 120.0], "text": "Indian Ocean basin western Indian Ocean eastern Indian Ocean"},
        {"id": "facet:region:north_atlantic", "kind": "region", "value": "North Atlantic", "bbox": [0.0, 70.0, -80.0, 20.0], "text": "North Atlantic Atlantic Ocean northern Atlantic"},
        {"id": "facet:depth:surface", "kind": "depth", "value": "surface", "depth_range": [0.0, 100.0], "text": "surface shallow upper ocean near surface top layer zero to one hundred meters"},
        {"id": "facet:depth:mixed", "kind": "depth", "value": "mixed", "depth_range": [0.0, 500.0], "text": "mixed upper ocean shallow and intermediate depths upper water column"},
        {"id": "facet:depth:deep", "kind": "depth", "value": "deep", "depth_range": [500.0, 2000.0], "text": "deep ocean deep water below five hundred meters abyssal water"},
        {"id": "facet:depth:thermocline", "kind": "depth", "value": "deep", "depth_range": [100.0, 500.0], "text": "thermocline depth transition layer below surface ocean"},
        {"id": "facet:time:recent", "kind": "time", "value": "recent", "days": 30, "text": "recent latest lately currently now in the last month newest observations"},
        {"id": "facet:time:week", "kind": "time", "value": "recent", "days": 7, "text": "last week past week this week very recent observations"},
        {"id": "facet:time:year", "kind": "time", "value": "historical", "days": 365, "text": "this year annual yearly over the past year historical observations"},
    ]


def _profile_records(db: Session) -> list[dict[str, Any]]:
    profiles = db.scalars(select(Profile).order_by(Profile.profile_id)).all()
    if not profiles:
        return []
    profile_ids = [profile.profile_id for profile in profiles]
    measurements = db.scalars(select(Measurement).where(Measurement.profile_id.in_(profile_ids))).all()
    by_profile: dict[str, list[Measurement]] = {}
    for measurement in measurements:
        by_profile.setdefault(measurement.profile_id, []).append(measurement)
    records: list[dict[str, Any]] = []
    for profile in profiles:
        profile_measurements = by_profile.get(profile.profile_id, [])
        depths = [float(item.depth) for item in profile_measurements if item.depth is not None]
        variables = [
            name
            for name in ("temperature", "salinity", "oxygen", "chlorophyll")
            if any(getattr(item, name) is not None for item in profile_measurements)
        ]
        depth_min = min(depths) if depths else None
        depth_max = max(depths) if depths else None
        text = (
            f"Argo ocean profile {profile.profile_id} from float {profile.float_id}; "
            f"latitude {profile.lat}; longitude {profile.lon}; collected {_iso(profile.timestamp)}; "
            f"variables {', '.join(variables) or 'ocean observations'}; "
            f"depth range {depth_min or 0} to {depth_max or 0} meters."
        )
        records.append(
            {
                "id": f"profile:{profile.profile_id}",
                "kind": "profile",
                "profile_id": profile.profile_id,
                "float_id": profile.float_id,
                "lat": profile.lat,
                "lon": profile.lon,
                "timestamp": _iso(profile.timestamp),
                "depth_min": depth_min,
                "depth_max": depth_max,
                "variables": variables,
                "text": text,
            }
        )
    return records


def _metadata_payload(records: list[dict[str, Any]], dimension: int) -> dict[str, Any]:
    return {"version": INDEX_VERSION, "model": MODEL_NAME, "dimension": dimension, "records": records}


class SemanticIndex:
    """Persisted FAISS index with profile and facet metadata."""

    def __init__(self, index_dir: Path | str = INDEX_DIR):
        self.index_dir = Path(index_dir)
        self.index_path = self.index_dir / "profiles.index"
        self.metadata_path = self.index_dir / "metadata.json"
        self.last_timings: dict[str, float] = {"embedding_ms": 0.0, "faiss_ms": 0.0}

    def reset_timings(self) -> None:
        self.last_timings = {"embedding_ms": 0.0, "faiss_ms": 0.0}

    def _load(self) -> tuple[Any, list[dict[str, Any]]] | None:
        if not self.index_path.exists() or not self.metadata_path.exists():
            return None
        try:
            faiss, _ = _load_dependencies()
            index = faiss.read_index(str(self.index_path))
            payload = json.loads(self.metadata_path.read_text(encoding="utf-8"))
            records = payload.get("records", [])
            if index.ntotal != len(records) or payload.get("model") != MODEL_NAME:
                return None
            return index, records
        except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
            LOGGER.warning("Unable to load semantic index: %s", exc)
            return None

    def rebuild(self, db: Session) -> int:
        records = _facet_records() + _profile_records(db)
        if not records:
            return 0
        encode_started = time.perf_counter()
        vectors = _encode(record["text"] for record in records)
        self.last_timings["embedding_ms"] += (time.perf_counter() - encode_started) * 1000
        faiss, _ = _load_dependencies()
        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(vectors)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        faiss.write_index(index, str(self.index_path))
        self.metadata_path.write_text(
            json.dumps(_metadata_payload(records, vectors.shape[1]), indent=2),
            encoding="utf-8",
        )
        return len(records)

    def refresh(self, db: Session) -> int:
        """Append new profiles when possible, rebuilding for changed/deleted rows."""
        current_profiles = _profile_records(db)
        static_records = _facet_records()
        loaded = self._load()
        if loaded is None:
            records = static_records + current_profiles
            return self.rebuild(db) if records else 0
        index, old_records = loaded
        old_facets = [record for record in old_records if record.get("kind") != "profile"]
        old_profiles = {record["id"]: record for record in old_records if record.get("kind") == "profile"}
        current_by_id = {record["id"]: record for record in current_profiles}
        if old_facets != static_records or any(
            profile_id not in current_by_id or old_record.get("text") != current_by_id[profile_id].get("text")
            for profile_id, old_record in old_profiles.items()
        ):
            return self.rebuild(db)
        new_records = [record for record in current_profiles if record["id"] not in old_profiles]
        if new_records:
            encode_started = time.perf_counter()
            vectors = _encode(record["text"] for record in new_records)
            self.last_timings["embedding_ms"] += (time.perf_counter() - encode_started) * 1000
            index.add(vectors)
            old_records.extend(new_records)
            faiss, _ = _load_dependencies()
            faiss.write_index(index, str(self.index_path))
            self.metadata_path.write_text(
                json.dumps(_metadata_payload(old_records, index.d), indent=2),
                encoding="utf-8",
            )
        return len(old_records)

    def search(self, question: str, top_k: int = DEFAULT_TOP_K) -> list[tuple[float, dict[str, Any]]]:
        loaded = self._load()
        if loaded is None:
            return []
        index, records = loaded
        encode_started = time.perf_counter()
        vector = _encode([question])
        self.last_timings["embedding_ms"] += (time.perf_counter() - encode_started) * 1000
        count = min(index.ntotal, max(1, top_k))
        faiss_started = time.perf_counter()
        scores, positions = index.search(vector, count)
        self.last_timings["faiss_ms"] += (time.perf_counter() - faiss_started) * 1000
        return [
            (float(score), records[int(position)])
            for score, position in zip(scores[0], positions[0])
            if position >= 0 and int(position) < len(records)
        ]


def _keyword_topic(question: str) -> dict[str, Any]:
    lower = question.lower()
    variable = "temperature"
    if re.search(r"\b(oxygen|o2|deoxygenation|hypoxia)\b", lower):
        variable = "oxygen"
    elif re.search(r"\b(salinity|salt|salty)\b", lower):
        variable = "salinity"
    elif re.search(r"\b(chlorophyll|phytoplankton|algae)\b", lower):
        variable = "chlorophyll"

    region = "global"
    bbox = None
    if re.search(r"\b(somali|somalia|horn of africa)\b", lower):
        region, bbox = "Somali coast", [-3.0, 15.0, 40.0, 55.0]
    elif "arabian" in lower:
        region, bbox = "Arabian Sea", [8.0, 30.0, 30.0, 80.0]
    elif "indian ocean" in lower:
        region, bbox = "Indian Ocean", [-40.0, 30.0, 20.0, 120.0]
    elif "atlantic" in lower:
        region, bbox = "North Atlantic", [0.0, 70.0, -80.0, 20.0]

    depth_mode = "deep" if re.search(r"\b(deep|thermocline|abyssal)\b", lower) else "surface" if re.search(r"\b(surface|shallow|upper ocean)\b", lower) else "mixed"
    depth_range = {"surface": [0.0, 100.0], "deep": [500.0, 2000.0], "mixed": None}[depth_mode]
    days = 7 if re.search(r"\b(last|past) week\b", lower) else 365 if re.search(r"\b(year|annual|historical)\b", lower) else 30 if re.search(r"\b(recent|latest|lately|current|now|month)\b", lower) else None
    time_range = None if days is None else {"start": _iso(datetime.now(timezone.utc) - timedelta(days=days)), "end": _iso(datetime.now(timezone.utc))}
    return {
        "variable": variable,
        "region": region,
        "region_bbox": bbox,
        "depth_mode": depth_mode,
        "depth_range": depth_range,
        "time_range": time_range,
        "confidence": 0.0,
        "semantic": False,
        "semantic_matches": [],
    }


def classify_question(question: str, index: SemanticIndex | None = None, db: Session | None = None) -> dict[str, Any]:
    """Classify a question using top-k semantic matches, then fill weak fields lexically."""
    topic = _keyword_topic(question)
    semantic = SemanticIndex() if index is None else index
    if hasattr(semantic, "reset_timings"):
        semantic.reset_timings()
    try:
        if db is not None and semantic._load() is None:
            semantic.refresh(db)
        matches = semantic.search(question, top_k=CLASSIFICATION_TOP_K)
    except Exception as exc:
        LOGGER.info("%s", exc)
        return topic
    topic["semantic_matches"] = [
        {
            "score": round(float(score), 4),
            "id": record.get("id"),
            "kind": record.get("kind"),
            "text": record.get("text", ""),
        }
        for score, record in matches[:DEFAULT_TOP_K]
    ]
    timings = getattr(semantic, "last_timings", {})
    topic["_timings"] = {key: round(value, 2) for key, value in timings.items()}
    selected: dict[str, tuple[float, dict[str, Any]]] = {}
    for score, record in matches:
        kind = record.get("kind")
        if kind not in {"variable", "region", "depth", "time"}:
            continue
        if kind not in selected or score > selected[kind][0]:
            selected[kind] = (score, record)
    for kind, (score, record) in selected.items():
        if score < SEMANTIC_CONFIDENCE_THRESHOLD:
            continue
        if kind == "variable":
            topic["variable"] = record["value"]
        elif kind == "region":
            topic["region"] = record["value"]
            topic["region_bbox"] = record.get("bbox")
        elif kind == "depth":
            topic["depth_mode"] = record["value"]
            topic["depth_range"] = record.get("depth_range")
        elif kind == "time":
            days = int(record["days"])
            now = datetime.now(timezone.utc)
            topic["time_range"] = {"start": _iso(now - timedelta(days=days)), "end": _iso(now)}
        topic["semantic"] = True
        topic["confidence"] = max(topic["confidence"], round(score, 4))
    return topic


def refresh_index(db: Session, *, index: SemanticIndex | None = None) -> int:
    """Refresh the persisted index after ingestion without making ingestion fail."""
    target = SemanticIndex() if index is None else index
    return target.refresh(db)
