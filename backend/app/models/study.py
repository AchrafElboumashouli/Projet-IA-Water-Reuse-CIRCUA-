"""
Modèle SQLAlchemy : studies

Représente une étude (campagne expérimentale) menée sur une période
donnée, pour un type de plante donné.
"""

from sqlalchemy import Column, Date, Integer, String
from sqlalchemy.orm import relationship

from app.database.session import Base


class Study(Base):
    """
    Root entity of the study-centric architecture.

    A Study is the parent of both:
        - raw_sensor_data : automatic ESP32/ThingSpeak measurements
        - cycles          : manual laboratory campaigns, each holding
                             cycle_results (average/std/removal %)
    """

    __tablename__ = "studies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    study_name = Column(String(255), nullable=False, index=True)
    plant_type = Column(String(100), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)

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

    # Manual laboratory cycles (each cycle owns its cycle_results).
    cycles = relationship(
        "Cycle",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Study id={self.id} name={self.study_name} plant={self.plant_type}>"
