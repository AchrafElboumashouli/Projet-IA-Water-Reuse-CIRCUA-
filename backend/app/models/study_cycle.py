"""
Modèle SQLAlchemy : study_cycles

Table d'association many-to-many entre `studies` et `cycles`.

Un Cycle est une entité indépendante et permanente : il ne peut plus être
supprimé par la suppression d'une Study, et peut être utilisé par
PLUSIEURS Studies en même temps (ex. Study A -> Cycle 1 ET Study B ->
Cycle 1 simultanément). Cette table ne porte QUE la relation
d'utilisation ; elle ne duplique jamais le Cycle, ses `cycle_results` ou
son `cycle_plants`.

    study_cycles.study_id -> studies.id  (ON DELETE CASCADE)
    study_cycles.cycle_id -> cycles.id   (ON DELETE CASCADE)

ON DELETE CASCADE ici ne supprime jamais le Cycle ou l'Étude eux-mêmes :
il supprime uniquement la LIGNE D'ASSOCIATION dans `study_cycles` quand
l'un des deux parents est supprimé. C'est exactement le comportement
voulu :

    - Supprimer une Study -> ses lignes `study_cycles` disparaissent,
      donc elle n'"utilise" plus aucun Cycle -> mais les Cycles, leurs
      `cycle_results` et leur `cycle_plants` restent intacts en base.
    - Le Cycle lui-même n'est plus supprimable via l'application (voir
      suppression de DELETE /api/cycles/{id}) ; `study_cycles.cycle_id`
      garde tout de même ON DELETE CASCADE pour l'intégrité référentielle
      si un cycle était un jour supprimé directement en base.

Une contrainte d'unicité (study_id, cycle_id) empêche une double
association accidentelle du même Cycle sur la même Study.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database.session import Base
from app.utils.timezone import now_utc


class StudyCycle(Base):
    __tablename__ = "study_cycles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    study_id = Column(
        Integer,
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cycle_id = Column(
        Integer,
        ForeignKey("cycles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)

    study = relationship("Study", back_populates="study_cycle_links")
    cycle = relationship("Cycle", back_populates="study_cycle_links")

    __table_args__ = (
        UniqueConstraint("study_id", "cycle_id", name="uq_study_cycles_study_id_cycle_id"),
    )

    def __repr__(self) -> str:
        return f"<StudyCycle id={self.id} study_id={self.study_id} cycle_id={self.cycle_id}>"
