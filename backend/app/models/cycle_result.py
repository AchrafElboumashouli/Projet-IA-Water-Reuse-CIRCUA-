"""
Modèle SQLAlchemy : cycle_results

Stocke, pour chaque cycle, une ligne par (paramètre, rôle d'étape) avec
les 3 réplicats saisis/importés et les valeurs calculées (moyenne,
écart-type, abattement/removal %).

`stage_role` contient le rôle stable interne ("stage_1" / "stage_2" /
"stage_3" — voir app/schemas/cycle.py::STAGE_ROLES), utilisé pour
identifier la ligne de référence/baseline du calcul de Removal %.

`stage` contient le libellé d'étape RÉEL, persisté tel quel en base
("Wastewater" / "Planted Series" / "Control Series" — voir
app/schemas/cycle.py::STAGE_LABELS). Il est calculé une seule fois à
l'écriture (voir cycle_service.build_cycle_results) à partir de
`stage_role`, afin que la base de données elle-même contienne les
vraies valeurs d'étape (jamais "stage_1"/"stage_2"/"stage_3" côté
utilisateur) plutôt qu'un libellé recalculé/dérivé uniquement à la
lecture.

IMPORTANT : cette table NE CONTIENT AUCUNE information de plante.
Les noms de plante (plant_1/plant_2/plant_3) vivent exclusivement dans
la table séparée `cycle_plants` (voir app/models/cycle_plants.py),
reliée à ce cycle via `cycle_id`. La relation entre plantes et
résultats est donc :

    cycle_plants.cycle_id  -> cycles.id
    cycle_results.cycle_id -> cycles.id

et n'est JAMAIS portée par une colonne directe sur `cycle_results`, ni
par le fichier Excel importé.
"""

from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database.session import Base


class CycleResult(Base):
    __tablename__ = "cycle_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cycle_id = Column(
        Integer,
        ForeignKey("cycles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    parameter = Column(String(64), nullable=False)

    # Libellé d'étape RÉEL, persisté en base ("Wastewater"/"Planted
    # Series"/"Control Series" — voir app/schemas/cycle.py::STAGE_LABELS).
    # C'est la valeur que l'API et le frontend affichent pour la colonne
    # "Stage" ; elle est écrite une fois à la création de la ligne et ne
    # dépend d'aucune dérivation à la lecture.
    stage = Column(String(32), nullable=False)

    replicate_1 = Column(Float, nullable=True)
    replicate_2 = Column(Float, nullable=True)
    replicate_3 = Column(Float, nullable=True)

    average = Column(Float, nullable=True)
    std = Column(Float, nullable=True)

    removal_1 = Column(Float, nullable=True)
    removal_2 = Column(Float, nullable=True)
    removal_3 = Column(Float, nullable=True)
    removal_percent = Column(Float, nullable=True)
    removal_std = Column(Float, nullable=True)

    # Rôle stable interne ("stage_1"/"stage_2"/"stage_3") — sert
    # UNIQUEMENT de base au calcul du Removal % (jamais affiché tel
    # quel côté utilisateur).
    stage_role = Column(String(32), nullable=False)

    cycle = relationship("Cycle", back_populates="results")

    def __repr__(self) -> str:
        return (
            f"<CycleResult id={self.id} cycle_id={self.cycle_id} "
            f"parameter={self.parameter} stage_role={self.stage_role}>"
        )
