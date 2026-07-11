"""study-centric refactor: link raw_sensor_data to studies directly,
add cycles / cycle_results, retire study_results

Revision ID: 0002_study_centric
Revises: 0001_initial
Create Date: 2026-07-05 00:00:00

This migration turns `studies` into the true root entity of the schema:

    studies
      +-- raw_sensor_data   (new study_id FK, nullable)
      +-- cycles            (new table)
            +-- cycle_results (new table)

`study_results` was a materialized, hand-populated copy of
`raw_sensor_data` rows filtered by a study's date range. Since every
row in it corresponds 1:1 to a row already in `raw_sensor_data`
(matched by created_at + set_number), we backfill `study_id` directly
onto `raw_sensor_data` from `study_results` and then drop the now
redundant table. No sensor data is lost: `raw_sensor_data` itself is
never touched except for the new column.

`study_id` on `raw_sensor_data` is nullable: the ESP32/ThingSpeak
collector keeps inserting rows with no knowledge of studies (see
app/collectors/collector.py, unmodified); rows get linked afterward
via POST /api/study/{id}/assign.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_study_centric"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. raw_sensor_data becomes a direct child of studies
    # ------------------------------------------------------------------
    op.add_column(
        "raw_sensor_data",
        sa.Column("study_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_raw_sensor_data_study_id", "raw_sensor_data", ["study_id"])
    op.create_foreign_key(
        "fk_raw_sensor_data_study_id",
        "raw_sensor_data",
        "studies",
        ["study_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ------------------------------------------------------------------
    # 2. Backfill study_id from the soon-to-be-dropped study_results,
    #    matching rows by (created_at, set_number) since study_results
    #    was an exact copy of the raw_sensor_data rows it covered.
    # ------------------------------------------------------------------
    op.execute(
        """
        UPDATE raw_sensor_data AS rsd
        SET study_id = sr.study_id
        FROM study_results AS sr
        WHERE rsd.created_at = sr.created_at
          AND rsd.set_number = sr.set_number
          AND rsd.study_id IS NULL
        """
    )

    # ------------------------------------------------------------------
    # 3. cycles
    # ------------------------------------------------------------------
    op.create_table(
        "cycles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "study_id",
            sa.Integer(),
            sa.ForeignKey("studies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("cycle_name", sa.String(length=255), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cycles_study_id", "cycles", ["study_id"])

    # ------------------------------------------------------------------
    # 4. cycle_results
    # ------------------------------------------------------------------
    op.create_table(
        "cycle_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "cycle_id",
            sa.Integer(),
            sa.ForeignKey("cycles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("parameter", sa.String(length=64), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("replicate_1", sa.Float(), nullable=True),
        sa.Column("replicate_2", sa.Float(), nullable=True),
        sa.Column("replicate_3", sa.Float(), nullable=True),
        sa.Column("average", sa.Float(), nullable=True),
        sa.Column("std", sa.Float(), nullable=True),
        sa.Column("removal_1", sa.Float(), nullable=True),
        sa.Column("removal_2", sa.Float(), nullable=True),
        sa.Column("removal_3", sa.Float(), nullable=True),
        sa.Column("removal_percent", sa.Float(), nullable=True),
        sa.Column("removal_std", sa.Float(), nullable=True),
    )
    op.create_index("ix_cycle_results_cycle_id", "cycle_results", ["cycle_id"])

    # ------------------------------------------------------------------
    # 5. Drop the now-redundant study_results table
    #    (its data has been fully absorbed into raw_sensor_data.study_id)
    # ------------------------------------------------------------------
    op.drop_index("ix_study_results_set_number", table_name="study_results")
    op.drop_index("ix_study_results_plant_type", table_name="study_results")
    op.drop_index("ix_study_results_created_at", table_name="study_results")
    op.drop_index("ix_study_results_study_id", table_name="study_results")
    op.drop_table("study_results")


def downgrade() -> None:
    # Recreate study_results and reverse-backfill it from raw_sensor_data,
    # so the migration is fully reversible.
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

    op.execute(
        """
        INSERT INTO study_results
            (study_id, created_at, ph, temperature, ec, turbidity, "do", time, plant_type, set_number)
        SELECT
            rsd.study_id, rsd.created_at, rsd.ph, rsd.temperature, rsd.ec, rsd.turbidity, rsd."do",
            NULL, s.plant_type, rsd.set_number
        FROM raw_sensor_data AS rsd
        JOIN studies AS s ON s.id = rsd.study_id
        WHERE rsd.study_id IS NOT NULL
        """
    )

    op.drop_table("cycle_results")
    op.drop_table("cycles")

    op.drop_constraint("fk_raw_sensor_data_study_id", "raw_sensor_data", type_="foreignkey")
    op.drop_index("ix_raw_sensor_data_study_id", table_name="raw_sensor_data")
    op.drop_column("raw_sensor_data", "study_id")
