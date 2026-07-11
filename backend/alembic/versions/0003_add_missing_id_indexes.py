"""add missing indexes on primary key id columns

Revision ID: 0003_id_indexes
Revises: 0002_study_centric
Create Date: 2026-07-11 00:00:00

Every model declares its `id` column with `index=True` (e.g.
`id = Column(Integer, primary_key=True, index=True, ...)`), which asks
SQLAlchemy for an explicit non-unique btree index on `id` in addition
to the implicit primary-key constraint index. Migrations 0001 and 0002
never created that explicit index, so `alembic revision --autogenerate`
always detected drift (`ix_studies_id`, `ix_cycles_id`,
`ix_cycle_results_id`, `ix_raw_sensor_data_id` reported as "missing")
even on a freshly migrated, fully up-to-date database. This migration
closes that gap so autogenerate produces an empty diff against the
current models.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0003_id_indexes"
down_revision: Union[str, None] = "0002_study_centric"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(op.f("ix_studies_id"), "studies", ["id"], unique=False)
    op.create_index(op.f("ix_raw_sensor_data_id"), "raw_sensor_data", ["id"], unique=False)
    op.create_index(op.f("ix_cycles_id"), "cycles", ["id"], unique=False)
    op.create_index(op.f("ix_cycle_results_id"), "cycle_results", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cycle_results_id"), table_name="cycle_results")
    op.drop_index(op.f("ix_cycles_id"), table_name="cycles")
    op.drop_index(op.f("ix_raw_sensor_data_id"), table_name="raw_sensor_data")
    op.drop_index(op.f("ix_studies_id"), table_name="studies")
