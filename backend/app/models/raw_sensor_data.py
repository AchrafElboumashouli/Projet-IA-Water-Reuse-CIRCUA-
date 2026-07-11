"""
Modèle SQLAlchemy : raw_sensor_data

Stocke les données brutes provenant des capteurs (via ThingSpeak),
après nettoyage et conversion de types par le collecteur.
"""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database.session import Base


class RawSensorData(Base):
    __tablename__ = "raw_sensor_data"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Rattachement à une étude (peut être NULL : une mesure est collectée
    # automatiquement par le scheduler ThingSpeak avant qu'un opérateur ne
    # l'assigne à une étude via /api/study/{id}/assign). ON DELETE SET NULL
    # pour ne jamais perdre une mesure brute si l'étude est supprimée.
    study_id = Column(
        Integer,
        ForeignKey("studies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Horodatage de la mesure (fourni par ThingSpeak)
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)

    # Identifiant de l'entrée ThingSpeak (entry_id du flux)
    entry_id = Column(Integer, nullable=False, index=True)

    # Mesures des capteurs
    ph = Column(Float, nullable=True)
    temperature = Column(Float, nullable=True)
    ec = Column(Float, nullable=True)
    turbidity = Column(Float, nullable=True)
    do = Column(Float, nullable=True)

    # Identifiant du channel ThingSpeak (1 = SET 1, 2 = SET 2)
    set_number = Column(Integer, nullable=False, index=True)

    # Horodatage d'insertion en base
    inserted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    study = relationship("Study", back_populates="raw_sensor_data")

    __table_args__ = (
        # Empêche l'insertion de doublons pour un même channel
        UniqueConstraint("entry_id", "set_number", name="uq_raw_sensor_entry_set"),
    )

    def __repr__(self) -> str:
        return (
            f"<RawSensorData id={self.id} study_id={self.study_id} set={self.set_number} "
            f"entry_id={self.entry_id} created_at={self.created_at}>"
        )
