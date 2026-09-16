from __future__ import annotations

import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db.models import Float, Measurement, Profile
from app.db.session import SessionLocal


def generate_profiles() -> list[dict]:
    random.seed(19)
    profiles = []
    base_time = datetime.now(timezone.utc) - timedelta(hours=12)
    for float_number in range(1, 21):
        if float_number % 2 == 0:
            lat = round(10 + (float_number % 5) * 2.3 + random.uniform(-1.2, 1.2), 3)
            lon = round(43 + (float_number % 7) * 4.1 + random.uniform(-1.8, 1.8), 3)
        else:
            lat = round(18 + (float_number % 4) * 1.8 + random.uniform(-1.5, 1.5), 3)
            lon = round(58 + (float_number % 6) * 3.2 + random.uniform(-1.7, 1.7), 3)
        for index in range(12):
            timestamp = base_time + timedelta(minutes=index * 32 + float_number * 11)
            depths = np.linspace(0, 1700, 42)
            temperature = 18.5 + 4.9 * np.sin((depths / 1800) * math.pi * 1.2) + random.uniform(-0.7, 0.7)
            temperature = np.clip(temperature + (float_number % 10) * 0.25, 2.5, 30.5)
            salinity = 34.7 + 1.2 * np.cos(depths / 1200) + random.uniform(-0.3, 0.3)
            oxygen = 220 - (depths / 20) * 0.45 + random.uniform(-8, 8)
            chlorophyll = np.clip(0.12 + np.exp(-(depths - 150) / 300) * 0.8 + random.uniform(-0.05, 0.08), 0.02, 2.0)
            profiles.append(
                {
                    "id": f"argo-{float_number}-{index}",
                    "float_id": f"float-{float_number}",
                    "wmo_id": f"290000{float_number:03d}",
                    "timestamp": timestamp,
                    "lat": lat,
                    "lon": lon,
                    "depths": depths.tolist(),
                    "temperature": temperature.tolist(),
                    "salinity": salinity.tolist(),
                    "oxygen": oxygen.tolist(),
                    "chlorophyll": chlorophyll.tolist(),
                }
            )
    return profiles


def seed() -> None:
    profiles = generate_profiles()
    parquet_dir = ROOT / "data" / "parquet"
    parquet_dir.mkdir(parents=True, exist_ok=True)
    with SessionLocal.begin() as db:
        if db.scalar(select(Profile.profile_id).limit(1)):
            print("Database already contains profiles; nothing to seed.")
            return
        floats = {}
        rows = []
        for item in profiles:
            if item["float_id"] not in floats:
                floats[item["float_id"]] = Float(float_id=item["float_id"], wmo_id=item["wmo_id"])
                db.add(floats[item["float_id"]])
            db.add(Profile(profile_id=item["id"], float_id=item["float_id"], timestamp=item["timestamp"], lat=item["lat"], lon=item["lon"]))
            for index, depth in enumerate(item["depths"]):
                rows.append(
                    {
                        "profile_id": item["id"],
                        "depth": depth,
                        "temperature": item["temperature"][index],
                        "salinity": item["salinity"][index],
                        "oxygen": item["oxygen"][index],
                        "chlorophyll": item["chlorophyll"][index],
                        "qc_flag": "1",
                    }
                )
        db.add_all([Measurement(**row) for row in rows])
    pd.DataFrame(rows).to_parquet(parquet_dir / "seed_measurements.parquet", index=False)
    pd.DataFrame(
        [{"profile_id": item["id"], "float_id": item["float_id"], "timestamp": item["timestamp"], "lat": item["lat"], "lon": item["lon"]} for item in profiles]
    ).to_parquet(parquet_dir / "seed_profiles.parquet", index=False)
    print(f"Seeded {len(floats)} floats, {len(profiles)} profiles, and {len(rows)} measurements.")


if __name__ == "__main__":
    seed()
