"""persist query pipeline benchmark timings"""

from alembic import op
import sqlalchemy as sa

revision = "0002_benchmark_runs"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "benchmark_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("embedding_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("faiss_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("retrieval_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("sql_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("graph_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("llm_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_ms", sa.Float(), nullable=False),
        sa.Column("layer", sa.String(32), nullable=True),
    )
    op.create_index("ix_benchmark_runs_timestamp", "benchmark_runs", ["timestamp"])


def downgrade() -> None:
    op.drop_index("ix_benchmark_runs_timestamp", table_name="benchmark_runs")
    op.drop_table("benchmark_runs")
