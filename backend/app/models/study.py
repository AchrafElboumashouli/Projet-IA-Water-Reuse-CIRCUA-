"""
Modèle SQLAlchemy : studies

Représente une étude (campagne expérimentale) menée sur une période
donnée. Le type de plante n'est plus un attribut de l'étude : chaque
cycle porte désormais ses propres noms de plantes (voir app/models/cycle.py,
colonnes plant_1_name / plant_2_name / plant_3_name), une étude pouvant
regrouper plusieurs cycles testant des plantes différentes.
"""

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.database.session import Base


class Study(Base):
    """
    Root entity of the study-centric architecture.

    A Study is the parent of both:
        - raw_sensor_data : automatic ESP32/ThingSpeak measurements
        - cycles          : manual laboratory campaigns, each holding
                             cycle_results (average/std/removal %) and
                             its own plant names
    """

    __tablename__ = "studies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    study_name = Column(String(255), nullable=False, index=True)
    # Toujours stocké en UTC (voir app/utils/timezone.py). Les valeurs
    # saisies en heure locale sont converties avant insertion.
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=True)

    # Automatic sensor measurements assigned to this study.
    # A raw_sensor_data row can exist with study_id = NULL (freshly
    # collected, not yet assigned to any campaign), so this relationship
    # only ever shows rows that were explicitly linked.
    raw_sensor_data = relationship(
        "RawSensorData",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Manual laboratory cycles this study currently "uses", through the
    # `study_cycles` association table (see app/models/study_cycle.py).
    # A Study does NOT own a Cycle's lifecycle: this is a many-to-many
    # relationship, so the same Cycle can be used by several Studies at
    # once, and deleting a Study only removes its `study_cycles` rows
    # (ON DELETE CASCADE on `study_cycles.study_id`) — the Cycle itself,
    # its `cycle_results` and its `cycle_plants` are never touched.
    study_cycle_links = relationship(
        "StudyCycle",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    cycles = relationship(
        "Cycle",
        secondary="study_cycles",
        viewonly=True,
        back_populates="studies",
    )

    def __repr__(self) -> str:
        return f"<Study id={self.id} name={self.study_name}>"
