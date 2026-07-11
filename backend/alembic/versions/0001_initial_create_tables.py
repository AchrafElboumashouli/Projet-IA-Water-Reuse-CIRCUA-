"""create initial tables (raw_sensor_data, studies, study_results)

Revision ID: 0001_initial
Revises:
Create Date: 2025-01-01 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- raw_sensor_data --------------------------------------------------
    op.create_table(
        "raw_sensor_data",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("ph", sa.Float(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("ec", sa.Float(), nullable=True),
        sa.Column("turbidity", sa.Float(), nullable=True),
        sa.Column("do", sa.Float(), nullable=True),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("inserted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("entry_id", "set_number", name="uq_raw_sensor_entry_set"),
    )
    op.create_index("ix_raw_sensor_data_created_at", "raw_sensor_data", ["created_at"])
    op.create_index("ix_raw_sensor_data_entry_id", "raw_sensor_data", ["entry_id"])
    op.create_index("ix_raw_sensor_data_set_number", "raw_sensor_data", ["set_number"])

    # --- studies -----------------------------------------------------------
    op.create_table(
        "studies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_name", sa.String(length=255), nullable=False),
        sa.Column("plant_type", sa.String(length=100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
    )
    op.create_index("ix_studies_study_name", "studies", ["study_name"])
    op.create_index("ix_studies_plant_type", "studies", ["plant_type"])

    # --- study_results -------------------------------------------------------
    op.create_table(
        "study_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_id", sa.Integer(), sa.ForeignKey("studies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ph", sa.Float(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("ec", sa.Float(), nullable=True),
        sa.Column("turbidity", sa.Float(), nullable=True),
        sa.Column("do", sa.Float(), nullable=True),
        sa.Column("time", sa.Float(), nullable=True),
        sa.Column("plant_type", sa.String(length=100), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
    )
    op.create_index("ix_study_results_study_id", "study_results", ["study_id"])
    op.create_index("ix_study_results_created_at", "study_results", ["created_at"])
    op.create_index("ix_study_results_plant_type", "study_results", ["plant_type"])
    op.create_index("ix_study_results_set_number", "study_results", ["set_number"])


def downgrade() -> None:
    op.drop_table("study_results")
    op.drop_table("studies")
    op.drop_table("raw_sensor_data")
