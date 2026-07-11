"""
Modèle SQLAlchemy : cycle_results

Stocke, pour chaque cycle, une ligne par (paramètre, étape) avec les
3 réplicats saisis par l'opérateur et les valeurs calculées
(moyenne, écart-type, abattement/removal %).
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

    cycle = relationship("Cycle", back_populates="results")

    def __repr__(self) -> str:
        return (
            f"<CycleResult id={self.id} cycle_id={self.cycle_id} "
            f"parameter={self.parameter} stage={self.stage}>"
        )
