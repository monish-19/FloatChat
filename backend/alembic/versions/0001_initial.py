"""create float profile measurements tables"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "floats",
        sa.Column("float_id", sa.String(64), primary_key=True),
        sa.Column("wmo_id", sa.String(32), nullable=False, unique=True),
        sa.Column("deployment_date", sa.Date(), nullable=True),
    )
    op.create_table(
        "profiles",
        sa.Column("profile_id", sa.String(96), primary_key=True),
        sa.Column("float_id", sa.String(64), sa.ForeignKey("floats.float_id"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
    )
    op.create_index("ix_profiles_float_id", "profiles", ["float_id"])
    op.create_index("ix_profiles_timestamp", "profiles", ["timestamp"])
    op.create_table(
        "measurements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("profile_id", sa.String(96), sa.ForeignKey("profiles.profile_id"), nullable=False),
        sa.Column("depth", sa.Float(), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("salinity", sa.Float(), nullable=True),
        sa.Column("oxygen", sa.Float(), nullable=True),
        sa.Column("chlorophyll", sa.Float(), nullable=True),
        sa.Column("qc_flag", sa.String(16), nullable=False, server_default="1"),
        sa.UniqueConstraint("profile_id", "depth", name="uq_measurement_profile_depth"),
    )
    op.create_index("ix_measurements_profile_id", "measurements", ["profile_id"])


def downgrade() -> None:
    op.drop_table("measurements")
    op.drop_index("ix_profiles_timestamp", table_name="profiles")
    op.drop_index("ix_profiles_float_id", table_name="profiles")
    op.drop_table("profiles")
    op.drop_table("floats")
