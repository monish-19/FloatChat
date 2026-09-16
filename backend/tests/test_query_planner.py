from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.models import Base, Float, Measurement, Profile
from app.query_planner import execute_query_plan, plan_query


def _session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = Session(engine)
    db.add_all(
        [
            Float(float_id="float-1", wmo_id="wmo-1"),
            Float(float_id="float-2", wmo_id="wmo-2"),
            Profile(
                profile_id="p-1",
                float_id="float-1",
                timestamp=datetime(2024, 1, 10, tzinfo=timezone.utc),
                lat=10,
                lon=40,
            ),
            Profile(
                profile_id="p-2",
                float_id="float-2",
                timestamp=datetime(2024, 1, 10, tzinfo=timezone.utc),
                lat=11,
                lon=41,
            ),
        ]
    )
    db.add_all(
        [
            Measurement(profile_id="p-1", depth=10, temperature=20, salinity=35),
            Measurement(profile_id="p-1", depth=100, temperature=15, salinity=36),
            Measurement(profile_id="p-2", depth=10, temperature=18, salinity=34),
            Measurement(profile_id="p-2", depth=100, temperature=12, salinity=35),
        ]
    )
    db.commit()
    return db


def test_warmest_region_query_is_parameterized():
    db = _session()
    plan = plan_query("Find the warmest temperature in the Arabian Sea")
    assert plan is not None
    assert plan.operation == "extreme"
    assert "Arabian Sea" not in plan.debug_sql(db)
    result = execute_query_plan(plan, db)
    assert result.row_count == 1
    assert result.rows[0]["float_id"] == "float-1"


def test_average_depth_and_time_filters():
    db = _session()
    plan = plan_query("What is the average salinity from 0 to 100 meters from 2024-01-01 to 2024-02-01?")
    assert plan is not None
    result = execute_query_plan(plan, db)
    assert result.rows[0]["sample_count"] == 4
    assert result.rows[0]["value"] == 35


def test_compare_two_floats():
    db = _session()
    plan = plan_query("Compare temperature between float 1 and float 2")
    assert plan is not None
    result = execute_query_plan(plan, db)
    assert [row["float_id"] for row in result.rows] == ["float-1", "float-2"]
    assert [row["value"] for row in result.rows] == [17.5, 15]


def test_open_ended_question_keeps_fallback():
    assert plan_query("Tell me about the ocean") is None

