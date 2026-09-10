"""
Modèle SQLAlchemy : cycles

Un cycle représente une campagne de laboratoire (formulaire opérateur ou
import Excel). Chaque cycle possède :

    - ses propres résultats de laboratoire (`cycle_results`),
      identifiés par un rôle d'étape stable (stage_1/2/3 — voir
      app/schemas/cycle.py::STAGE_ROLES) ; ces lignes ne contiennent
      AUCUNE information de plante.
    - au plus une ligne de noms de plante (`cycle_plants` — voir
      app/models/cycle_plants.py), totalement indépendante de celle
      d'un autre cycle.

Un Cycle est une entité PERMANENTE et INDÉPENDANTE : il n'appartient plus
à une seule Study via une colonne `study_id`. La relation Study<->Cycle
est portée par la table d'association `study_cycles` (many-to-many — voir
app/models/study_cycle.py), ce qui permet à un même Cycle d'être utilisé
par PLUSIEURS Studies en même temps, et garantit qu'un Cycle ne disparaît
jamais quand une Study est supprimée (seule la ligne d'association est
retirée). Le Cycle ne peut plus être supprimé du tout via l'application
(voir suppression de DELETE /api/cycles/{id} dans app/routes/cycle.py) :
la page Cycles agit comme un dépôt permanent de tous les cycles.

La relation entre les plantes et les résultats n'existe jamais dans le
fichier Excel importé : elle est portée uniquement par PostgreSQL via
`cycle_id` (cycle_plants -> cycles -> cycle_results).
"""

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.database.session import Base
from app.utils.timezone import now_utc


class Cycle(Base):
    __tablename__ = "cycles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    cycle_name = Column(String(255), nullable=False)
    # Toujours stocké en UTC (voir app/utils/timezone.py). Les valeurs
    # saisies/importées en heure locale sont converties avant insertion.
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)

    # Many-to-many with Study through the `study_cycles` association
    # table. No cascade="delete-orphan" of any kind here: a Cycle's
    # lifecycle is entirely independent from any Study that uses it.
    study_cycle_links = relationship(
        "StudyCycle",
        back_populates="cycle",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    studies = relationship(
        "Study",
        secondary="study_cycles",
        viewonly=True,
        back_populates="cycles",
    )

    results = relationship(
        "CycleResult",
        back_populates="cycle",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    plants = relationship(
        "CyclePlants",
        back_populates="cycle",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,  # one cycle_plants row per cycle (1-1)
    )

    def __repr__(self) -> str:
        return f"<Cycle id={self.id} name={self.cycle_name}>"

