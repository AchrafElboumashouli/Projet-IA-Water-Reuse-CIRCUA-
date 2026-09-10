"""initial schema (consolidated, includes cycle reuse + study<->cycle m2m)

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-10 00:00:00

Single consolidated migration replacing the previous 0001-0003 chain.
This creates the FULL final schema directly — there is no intermediate
history to replay. Use this only against a brand-new/empty database.

Tables created:

    studies
    raw_sensor_data
    cycles              -- no study_id column: cycles are independent,
                           reusable entities not owned by any single study
    study_cycles        -- many-to-many association: study_id, cycle_id,
                           both FKs ON DELETE CASCADE (cascading only
                           removes the ASSOCIATION row, never the Cycle
                           or the Study themselves)
    cycle_plants        -- plant names for a cycle, separate from results
    cycle_results       -- experimental results only, NO plant columns
    sensor_alerts
    alert_config
    collector_run_state

`cycle_results` column order (as physically created here):

    id, cycle_id, parameter, stage,
    replicate_1, replicate_2, replicate_3,
    average, std,
    removal_1, removal_2, removal_3, removal_percent, removal_std,
    stage_role

Relationship model:

    study_cycles.study_id  -> studies.id  (ON DELETE CASCADE, association only)
    study_cycles.cycle_id  -> cycles.id   (ON DELETE CASCADE, association only)
    cycle_plants.cycle_id  -> cycles.id   (ON DELETE CASCADE)
    cycle_results.cycle_id -> cycles.id   (ON DELETE CASCADE)

    i.e. cycle_plants -> cycles -> cycle_results (never a direct link
    between cycle_plants and cycle_results, and never any plant data
    inside cycle_results itself). A Study is deleted independently of
    its Cycles — deleting a Study only removes its study_cycles rows,
    never the Cycles, cycle_plants, or cycle_results attached to them.
    Cycles can never be deleted through the application.
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
    # ------------------------------------------------------------------
    # studies
    # ------------------------------------------------------------------
    op.create_table(
        "studies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_name", sa.String(length=255), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_studies_id", "studies", ["id"])
    op.create_index("ix_studies_study_name", "studies", ["study_name"])

    # ------------------------------------------------------------------
    # raw_sensor_data
    # ------------------------------------------------------------------
    op.create_table(
        "raw_sensor_data",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "study_id",
            sa.Integer(),
            sa.ForeignKey("studies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("ph", sa.Float(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("ec", sa.Float(), nullable=True),
        sa.Column("turbidity", sa.Float(), nullable=True),
        sa.Column("do", sa.Float(), nullable=True),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column(
            "inserted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("entry_id", "set_number", name="uq_raw_sensor_entry_set"),
    )
    op.create_index("ix_raw_sensor_data_id", "raw_sensor_data", ["id"])
    op.create_index("ix_raw_sensor_data_study_id", "raw_sensor_data", ["study_id"])
    op.create_index("ix_raw_sensor_data_created_at", "raw_sensor_data", ["created_at"])
    op.create_index("ix_raw_sensor_data_entry_id", "raw_sensor_data", ["entry_id"])
    op.create_index("ix_raw_sensor_data_set_number", "raw_sensor_data", ["set_number"])

    # ------------------------------------------------------------------
    # cycles (no study_id — independent, reusable entity)
    # ------------------------------------------------------------------
    op.create_table(
        "cycles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("cycle_name", sa.String(length=255), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_cycles_id", "cycles", ["id"])

    # ------------------------------------------------------------------
    # study_cycles (many-to-many association between studies and cycles)
    # ------------------------------------------------------------------
    op.create_table(
        "study_cycles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "study_id",
            sa.Integer(),
            sa.ForeignKey("studies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "cycle_id",
            sa.Integer(),
            sa.ForeignKey("cycles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("study_id", "cycle_id", name="uq_study_cycles_study_id_cycle_id"),
    )
    op.create_index("ix_study_cycles_id", "study_cycles", ["id"])
    op.create_index("ix_study_cycles_study_id", "study_cycles", ["study_id"])
    op.create_index("ix_study_cycles_cycle_id", "study_cycles", ["cycle_id"])

    # ------------------------------------------------------------------
    # cycle_plants (plant names for a cycle — separate from results)
    # ------------------------------------------------------------------
    op.create_table(
        "cycle_plants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "cycle_id",
            sa.Integer(),
            sa.ForeignKey("cycles.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("plant_1", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("plant_2", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("plant_3", sa.String(length=100), nullable=False, server_default=""),
    )
    op.create_index("ix_cycle_plants_id", "cycle_plants", ["id"])
    op.create_index("ix_cycle_plants_cycle_id", "cycle_plants", ["cycle_id"])

    # ------------------------------------------------------------------
    # cycle_results (NO plant columns — column order as requested)
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
        sa.Column("stage_role", sa.String(length=32), nullable=False),
    )
    op.create_index("ix_cycle_results_id", "cycle_results", ["id"])
    op.create_index("ix_cycle_results_cycle_id", "cycle_results", ["cycle_id"])

    # ------------------------------------------------------------------
    # sensor_alerts
    # ------------------------------------------------------------------
    op.create_table(
        "sensor_alerts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("alert_type", sa.String(length=30), nullable=False),
        sa.Column("sensor_set", sa.String(length=10), nullable=True),
        sa.Column(
            "study_id",
            sa.Integer(),
            sa.ForeignKey("studies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("consecutive_count", sa.Integer(), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="warning"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sensor_alerts_id", "sensor_alerts", ["id"])
    op.create_index("ix_sensor_alerts_alert_type", "sensor_alerts", ["alert_type"])
    op.create_index("ix_sensor_alerts_sensor_set", "sensor_alerts", ["sensor_set"])
    op.create_index("ix_sensor_alerts_study_id", "sensor_alerts", ["study_id"])
    op.create_index("ix_sensor_alerts_created_at", "sensor_alerts", ["created_at"])
    op.create_index("ix_sensor_alerts_status", "sensor_alerts", ["status"])

    # ------------------------------------------------------------------
    # alert_config (singleton row, id=1)
    # ------------------------------------------------------------------
    op.create_table(
        "alert_config",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("null_capture_threshold", sa.Integer(), nullable=False),
    )

    # ------------------------------------------------------------------
    # collector_run_state
    # ------------------------------------------------------------------
    op.create_table(
        "collector_run_state",
        sa.Column("set_number", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("consecutive_empty_runs", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("collector_run_state")
    op.drop_table("alert_config")

    op.drop_index("ix_sensor_alerts_status", table_name="sensor_alerts")
    op.drop_index("ix_sensor_alerts_created_at", table_name="sensor_alerts")
    op.drop_index("ix_sensor_alerts_study_id", table_name="sensor_alerts")
    op.drop_index("ix_sensor_alerts_sensor_set", table_name="sensor_alerts")
    op.drop_index("ix_sensor_alerts_alert_type", table_name="sensor_alerts")
    op.drop_index("ix_sensor_alerts_id", table_name="sensor_alerts")
    op.drop_table("sensor_alerts")

    op.drop_index("ix_cycle_results_cycle_id", table_name="cycle_results")
    op.drop_index("ix_cycle_results_id", table_name="cycle_results")
    op.drop_table("cycle_results")

    op.drop_index("ix_cycle_plants_cycle_id", table_name="cycle_plants")
    op.drop_index("ix_cycle_plants_id", table_name="cycle_plants")
    op.drop_table("cycle_plants")

    op.drop_index("ix_study_cycles_cycle_id", table_name="study_cycles")
    op.drop_index("ix_study_cycles_study_id", table_name="study_cycles")
    op.drop_index("ix_study_cycles_id", table_name="study_cycles")
    op.drop_table("study_cycles")

    op.drop_index("ix_cycles_id", table_name="cycles")
    op.drop_table("cycles")

    op.drop_index("ix_raw_sensor_data_set_number", table_name="raw_sensor_data")
    op.drop_index("ix_raw_sensor_data_entry_id", table_name="raw_sensor_data")
    op.drop_index("ix_raw_sensor_data_created_at", table_name="raw_sensor_data")
    op.drop_index("ix_raw_sensor_data_study_id", table_name="raw_sensor_data")
    op.drop_index("ix_raw_sensor_data_id", table_name="raw_sensor_data")
    op.drop_table("raw_sensor_data")

    op.drop_index("ix_studies_study_name", table_name="studies")
    op.drop_index("ix_studies_id", table_name="studies")
    op.drop_table("studies")
