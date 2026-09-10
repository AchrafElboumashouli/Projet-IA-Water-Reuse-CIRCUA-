"""
Modèle SQLAlchemy : cycle_plants

Stocke les noms de plante d'UN cycle, dans une table séparée de
`cycle_results`. Un cycle possède au plus une ligne `cycle_plants`
(relation 1-1 via `cycle_id`), indépendante des lignes de résultats
de ce même cycle.

Le fichier Excel importé par l'utilisateur ne contient PLUS aucune
information de plante : les noms de plante sont saisis/gérés au niveau
du cycle par l'application (formulaire "Enter Data for Replicate" ou
import Excel avec des colonnes Plant 1/2/3 lues une seule fois par
cycle — jamais dupliquées ligne par ligne). La relation entre les
plantes et les résultats expérimentaux est entièrement portée par
PostgreSQL :

    cycle_plants.cycle_id  -> cycles.id
    cycle_results.cycle_id -> cycles.id

    donc : cycle_plants -> cycles -> cycle_results

`cycle_results` ne contient plus aucune colonne de plante (voir
app/models/cycle_result.py) : cette séparation est stricte.
"""

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database.session import Base


class CyclePlants(Base):
    __tablename__ = "cycle_plants"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cycle_id = Column(
        Integer,
        ForeignKey("cycles.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # one cycle_plants record per cycle (1-1)
        index=True,
    )

    plant_1 = Column(String(100), nullable=False, default="")
    plant_2 = Column(String(100), nullable=False, default="")
    plant_3 = Column(String(100), nullable=False, default="")

    cycle = relationship("Cycle", back_populates="plants")

    def __repr__(self) -> str:
        return (
            f"<CyclePlants id={self.id} cycle_id={self.cycle_id} "
            f"plant_1={self.plant_1!r} plant_2={self.plant_2!r} plant_3={self.plant_3!r}>"
        )
