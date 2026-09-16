from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float as SQLFloat, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Float(Base):
    __tablename__ = "floats"

    float_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    wmo_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    deployment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    profiles: Mapped[list["Profile"]] = relationship(back_populates="float", cascade="all, delete-orphan")


class Profile(Base):
    __tablename__ = "profiles"

    profile_id: Mapped[str] = mapped_column(String(96), primary_key=True)
    float_id: Mapped[str] = mapped_column(ForeignKey("floats.float_id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    lat: Mapped[float] = mapped_column(SQLFloat)
    lon: Mapped[float] = mapped_column(SQLFloat)
    float: Mapped[Float] = relationship(back_populates="profiles")
    measurements: Mapped[list["Measurement"]] = relationship(back_populates="profile", cascade="all, delete-orphan")


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (UniqueConstraint("profile_id", "depth", name="uq_measurement_profile_depth"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.profile_id"), index=True)
    depth: Mapped[float] = mapped_column(SQLFloat)
    temperature: Mapped[float | None] = mapped_column(SQLFloat)
    salinity: Mapped[float | None] = mapped_column(SQLFloat)
    oxygen: Mapped[float | None] = mapped_column(SQLFloat)
    chlorophyll: Mapped[float | None] = mapped_column(SQLFloat)
    qc_flag: Mapped[str] = mapped_column(String(16), default="1")
    profile: Mapped[Profile] = relationship(back_populates="measurements")


class BenchmarkRun(Base):
    """A durable timing sample captured for one complete query pipeline run."""

    __tablename__ = "benchmark_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_ms: Mapped[float] = mapped_column(SQLFloat, nullable=False, default=0.0)
    faiss_ms: Mapped[float] = mapped_column(SQLFloat, nullable=False, default=0.0)
    retrieval_ms: Mapped[float] = mapped_column(SQLFloat, nullable=False, default=0.0)
    sql_ms: Mapped[float] = mapped_column(SQLFloat, nullable=False, default=0.0)
    graph_ms: Mapped[float] = mapped_column(SQLFloat, nullable=False, default=0.0)
    llm_ms: Mapped[float] = mapped_column(SQLFloat, nullable=False, default=0.0)
    total_ms: Mapped[float] = mapped_column(SQLFloat, nullable=False)
    layer: Mapped[str | None] = mapped_column(String(32), nullable=True)
