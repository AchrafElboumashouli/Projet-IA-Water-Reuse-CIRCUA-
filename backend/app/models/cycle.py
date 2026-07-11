"""
Modèle SQLAlchemy : cycles

Un cycle représente une campagne de laboratoire manuelle (formulaire
opérateur) rattachée à une étude. Chaque cycle possède ses propres
résultats de laboratoire (cycle_results).
"""

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database.session import Base


class Cycle(Base):
    __tablename__ = "cycles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    study_id = Column(
        Integer,
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    cycle_name = Column(String(255), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    study = relationship("Study", back_populates="cycles")
    results = relationship(
        "CycleResult",
        back_populates="cycle",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Cycle id={self.id} study_id={self.study_id} name={self.cycle_name}>"
