"""Pull recent Argo profiles from ERDDAP or a GDAC netCDF endpoint.

The module deliberately contains no fallback data generator.  A source URL must
be configured and all records are bounded to the Indian Ocean before they are
written to the Phase 1 SQLAlchemy tables.
"""

from __future__ import annotations

import io
import logging
import os
import sys
import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd
import requests
import xarray as xr
from sqlalchemy import select
from sqlalchemy.orm import Session

if __package__ in (None, ""):  # python app/ingestion/argo_pull.py
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db.models import Float, Measurement, Profile  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.search.semantic_index import refresh_index  # noqa: E402

LOGGER = logging.getLogger(__name__)
DEFAULT_ERDDAP_URL = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.nc"
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = -40.0, 30.0, 20.0, 120.0
GOOD_QC = {"1", "2", "A", "B", "good", "probably_good"}


@dataclass(frozen=True)
class PullResult:
    profiles: int
    measurements: int
    skipped_qc: int = 0
    source: str = ""


def _configuration(lookback_hours: int | None) -> tuple[str, str, datetime]:
    hours = int(os.getenv("ARGO_LOOKBACK_HOURS", "24")) if lookback_hours is None else lookback_hours
    if hours < 1 or hours > 24 * 31:
        raise ValueError("ARGO_LOOKBACK_HOURS must be between 1 and 744")
    source = os.getenv("ARGO_SOURCE", "erddap").strip().lower()
    if source not in {"erddap", "gdac"}:
        raise ValueError("ARGO_SOURCE must be either 'erddap' or 'gdac'")
    env_name = "ARGO_ERDDAP_URL" if source == "erddap" else "ARGO_GDAC_URL"
    url = os.getenv(env_name, DEFAULT_ERDDAP_URL if source == "erddap" else "").strip()
    if not url:
        raise ValueError(f"{env_name} is required for Argo ingestion")
    return source, url, datetime.now(timezone.utc) - timedelta(hours=hours)


def _source_url(source: str, url: str, start: datetime) -> str:
    query = os.getenv("ARGO_ERDDAP_QUERY", "").strip()
    values = {
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "lat_min": LAT_MIN,
        "lat_max": LAT_MAX,
        "lon_min": LON_MIN,
        "lon_max": LON_MAX,
    }
    if source != "erddap":
        return url.format(**values)
    if "{start}" in url or "{end}" in url:
        return url.format(**values)
    if not query:
        query = (
            "JULD,LATITUDE,LONGITUDE,PLATFORM_NUMBER,CYCLE_NUMBER,"
            "PRES,TEMP,PSAL,DOXY,CHLA,PRES_QC"
        )
    query = query.format(**values)
    constraints = (
        f"JULD>={values['start']}&JULD<={values['end']}"
        f"&LATITUDE>={LAT_MIN}&LATITUDE<={LAT_MAX}"
        f"&LONGITUDE>={LON_MIN}&LONGITUDE<={LON_MAX}"
    )
    return f"{url}{'&' if '?' in url else '?'}{query}&{constraints}"


def fetch_dataset(*, lookback_hours: int | None = None) -> tuple[xr.Dataset, str, datetime]:
    """Download one netCDF response and open it with xarray."""
    source, url, start = _configuration(lookback_hours)
    request_url = _source_url(source, url, start)
    response = requests.get(request_url, timeout=int(os.getenv("ARGO_REQUEST_TIMEOUT", "90")))
    response.raise_for_status()
    try:
        dataset = xr.open_dataset(io.BytesIO(response.content), decode_cf=True)
        dataset.load()
    except Exception as exc:  # xarray errors vary by installed netCDF engine
        raise RuntimeError(f"Unable to parse Argo netCDF from {request_url}: {exc}") from exc
    return dataset, request_url, start


def _variable(ds: xr.Dataset, *names: str) -> Any:
    lookup = {name.upper(): name for name in ds.variables}
    for name in names:
        if name.upper() in lookup:
            return ds[lookup[name.upper()]]
    return None


def _values(variable: Any, index: int, level_count: int | None = None) -> np.ndarray:
    if variable is None:
        return np.full(level_count or 1, np.nan)
    values = np.asarray(variable.values)
    if values.ndim == 0:
        return np.asarray([values.item()])
    if level_count is not None and values.ndim > 1:
        return np.asarray(values[index]).reshape(-1)[:level_count]
    if values.ndim > 1:
        return np.asarray(values[index]).reshape(-1)
    return np.asarray(values[index] if values.shape[0] > index else np.nan).reshape(-1)


def parse_dataset(ds: xr.Dataset, start: datetime) -> tuple[list[dict[str, Any]], int]:
    """Normalize common Argo variable names into profile/measurement records."""
    lat_var, lon_var = _variable(ds, "LATITUDE", "LAT"), _variable(ds, "LONGITUDE", "LON")
    time_var = _variable(ds, "JULD", "TIME", "DATE")
    if lat_var is None or lon_var is None or time_var is None:
        raise ValueError("Argo response lacks LATITUDE, LONGITUDE, or JULD/TIME")
    profile_dim = lat_var.dims[0] if lat_var.dims else None
    if profile_dim is None:
        raise ValueError("Argo coordinates are not profile-indexed")
    profile_count = lat_var.sizes[profile_dim]
    pressure_var = _variable(ds, "PRES", "PRESSURE", "DEPTH")
    qc_var = _variable(ds, "PRES_QC", "PROFILE_PRES_QC", "TEMP_QC")
    records: list[dict[str, Any]] = []
    skipped_qc = 0
    for index in range(profile_count):
        try:
            lat, lon = float(lat_var.values[index]), float(lon_var.values[index])
            timestamp = pd.Timestamp(time_var.values[index]).to_pydatetime()
            if pd.isna(timestamp) or not np.isfinite(lat) or not np.isfinite(lon):
                continue
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            if timestamp < start or not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
                continue
        except (TypeError, ValueError, OverflowError):
            continue
        depths = _values(pressure_var, index)
        level_count = len(depths)
        arrays = {
            "temperature": _values(_variable(ds, "TEMP", "TEMPERATURE"), index, level_count),
            "salinity": _values(_variable(ds, "PSAL", "SALINITY"), index, level_count),
            "oxygen": _values(_variable(ds, "DOXY", "OXYGEN"), index, level_count),
            "chlorophyll": _values(_variable(ds, "CHLA", "CHLOROPHYLL"), index, level_count),
        }
        wmo = _values(_variable(ds, "PLATFORM_NUMBER", "WMO_ID"), index)[0]
        cycle = _values(_variable(ds, "CYCLE_NUMBER", "CYCLE"), index)[0]
        wmo_id = str(wmo).strip().replace(".0", "") if pd.notna(wmo) else f"unknown-{index}"
        profile_id = f"{wmo_id}-{str(cycle).strip().replace('.0', '')}" if pd.notna(cycle) else f"{wmo_id}-{index}"
        for level in range(level_count):
            depth = float(depths[level]) if level < len(depths) else np.nan
            if not np.isfinite(depth) or depth < 0:
                continue
            qc = _values(qc_var, index, level_count)[level] if qc_var is not None else "1"
            qc_text = str(qc).strip()
            if qc_text.endswith(".0"):
                qc_text = qc_text[:-2]
            if qc_text.lower() not in GOOD_QC:
                skipped_qc += 1
                continue
            values = {key: (float(array[level]) if level < len(array) and np.isfinite(array[level]) else None) for key, array in arrays.items()}
            if all(value is None for value in values.values()):
                continue
            records.append({"profile_id": profile_id, "float_id": f"argo-{wmo_id}", "wmo_id": wmo_id, "timestamp": timestamp, "lat": lat, "lon": lon, "depth": depth, "qc_flag": qc_text or "1", **values})
    return records, skipped_qc


def _insert_records(db: Session, records: Iterable[dict[str, Any]]) -> tuple[int, int]:
    rows = list(records)
    if not rows:
        return 0, 0
    profile_ids = {row["profile_id"] for row in rows}
    existing_profiles = set(db.scalars(select(Profile.profile_id).where(Profile.profile_id.in_(profile_ids))).all())
    new_profile_count = len(profile_ids - existing_profiles)
    wmos = {row["wmo_id"] for row in rows}
    existing_float_ids = {wmo: float_id for wmo, float_id in db.execute(select(Float.wmo_id, Float.float_id).where(Float.wmo_id.in_(wmos))).all()}
    for row in rows:
        if row["wmo_id"] in existing_float_ids:
            row["float_id"] = existing_float_ids[row["wmo_id"]]
    for row in rows:
        if row["wmo_id"] not in existing_float_ids:
            db.add(Float(float_id=row["float_id"], wmo_id=row["wmo_id"]))
            existing_float_ids[row["wmo_id"]] = row["float_id"]
        if row["profile_id"] not in existing_profiles:
            db.add(Profile(profile_id=row["profile_id"], float_id=row["float_id"], timestamp=row["timestamp"], lat=row["lat"], lon=row["lon"]))
            existing_profiles.add(row["profile_id"])
    db.flush()
    inserted_measurements = 0
    existing_keys = {(pid, depth) for pid, depth in db.execute(select(Measurement.profile_id, Measurement.depth).where(Measurement.profile_id.in_(profile_ids))).all()}
    for row in rows:
        key = (row["profile_id"], row["depth"])
        if key in existing_keys:
            continue
        db.add(Measurement(**{key: row[key] for key in ("profile_id", "depth")}, temperature=row["temperature"], salinity=row["salinity"], oxygen=row["oxygen"], chlorophyll=row["chlorophyll"], qc_flag=row["qc_flag"]))
        existing_keys.add(key)
        inserted_measurements += 1
    return new_profile_count, inserted_measurements


def ingest_argo(db: Session, lookback_hours: int | None = None) -> PullResult:
    """Fetch, QC, and transactionally insert recent Argo observations."""
    ds, source_url, start = fetch_dataset(lookback_hours=lookback_hours)
    try:
        records, skipped = parse_dataset(ds, start)
        profiles_before = {row[0] for row in db.execute(select(Profile.profile_id).where(Profile.profile_id.in_({r["profile_id"] for r in records}))).all()} if records else set()
        with db.begin_nested():
            _, measurements = _insert_records(db, records)
        db.commit()
        try:
            refresh_index(db)
        except Exception as exc:
            # Ingestion remains usable if optional embedding/FAISS dependencies
            # are unavailable; the API will use its keyword fallback.
            LOGGER.warning("Semantic index refresh skipped: %s", exc)
        return PullResult(len({r["profile_id"] for r in records} - profiles_before), measurements, skipped, source_url)
    finally:
        ds.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest recent Indian Ocean Argo profiles into FloatChat.")
    parser.add_argument("--lookback-hours", type=int, default=None, help="Override ARGO_LOOKBACK_HOURS for this run.")
    args = parser.parse_args()
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
    with SessionLocal() as db:
        result = ingest_argo(db, lookback_hours=args.lookback_hours)
    print({"profiles": result.profiles, "measurements": result.measurements, "skipped_qc": result.skipped_qc, "source": result.source})


if __name__ == "__main__":
    main()
