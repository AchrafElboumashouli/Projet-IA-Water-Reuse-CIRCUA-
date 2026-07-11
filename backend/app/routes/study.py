"""
Routes API : système d'étude (/api/study).

Endpoints :
    - POST   /api/study                -> créer une étude
    - GET    /api/study                 -> lister les études
    - GET    /api/study/{id}            -> détail d'une étude
    - GET    /api/study/export          -> export CSV des mesures brutes d'une étude
    - POST   /api/study/{id}/assign     -> assigner des mesures brutes existantes à une étude
    - GET    /api/study/{id}/cycles     -> lister les cycles de laboratoire d'une étude
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.cycle import CycleSummaryOut
from app.schemas.study import StudyAssignResponse, StudyCreate, StudyOut
from app.services import cycle_service, study_service
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/study", tags=["Studies"])


@router.post("", response_model=StudyOut, status_code=201, summary="Créer une étude")
def create_study(study_in: StudyCreate, db: Session = Depends(get_db)):
    """Crée une nouvelle étude (campagne expérimentale)."""
    if study_in.end_date and study_in.end_date < study_in.start_date:
        raise HTTPException(status_code=400, detail="end_date doit être postérieure à start_date.")

    try:
        return study_service.create_study(db, study_in)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la création de l'étude : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la création de l'étude.")


@router.get("", response_model=list[StudyOut], summary="Lister les études")
def list_studies(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Retourne la liste des études existantes."""
    return study_service.list_studies(db, skip=skip, limit=limit)


@router.get("/export", summary="Exporter les mesures brutes d'une étude au format CSV")
def export_study_results(
    start_date: date = Query(..., description="Date de début (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Date de fin (YYYY-MM-DD)"),
    plant_type: str = Query(..., description="Type de plante"),
    set_number: int = Query(..., ge=1, le=2, description="Numéro du set de capteurs (1 ou 2)"),
    db: Session = Depends(get_db),
):
    """
    Exporte au format CSV les mesures brutes (`raw_sensor_data`) rattachées
    à une étude, correspondant aux filtres fournis.

    La colonne `time` (minutes écoulées depuis la première mesure du
    jeu de données exporté) est recalculée automatiquement.
    """
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date doit être postérieure ou égale à start_date.")

    try:
        buffer = study_service.export_study_results_csv(
            db, start_date=start_date, end_date=end_date, plant_type=plant_type, set_number=set_number
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de l'export CSV : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la génération de l'export CSV.")

    filename = f"study_export_{plant_type}_set{set_number}_{start_date}_{end_date}.csv"

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{study_id}", response_model=StudyOut, summary="Détail d'une étude")
def get_study(study_id: int, db: Session = Depends(get_db)):
    study = study_service.get_study(db, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="Étude introuvable.")
    return study


@router.post(
    "/{study_id}/assign",
    response_model=StudyAssignResponse,
    summary="Assigner des mesures brutes existantes à une étude",
)
def assign_study(
    study_id: int,
    set_number: int = Query(..., ge=1, le=2, description="Numéro du set de capteurs (1 ou 2)"),
    db: Session = Depends(get_db),
):
    """
    Lie les mesures brutes de `raw_sensor_data` correspondant à la période
    de l'étude (et au set de capteurs donné) en mettant à jour leur
    `study_id`. Remplace l'ancien endpoint `/populate`, qui dupliquait les
    données dans une table séparée (`study_results`, supprimée).
    """
    try:
        assigned = study_service.assign_raw_data_to_study(db, study_id=study_id, set_number=set_number)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de l'assignation de l'étude %s : %s", study_id, exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de l'assignation de l'étude.")

    return StudyAssignResponse(
        study_id=study_id,
        assigned_rows=assigned,
        message=f"{assigned} mesure(s) brute(s) assignée(s) à l'étude.",
    )


@router.get(
    "/{study_id}/cycles",
    response_model=list[CycleSummaryOut],
    summary="Lister les cycles de laboratoire d'une étude",
)
def list_study_cycles(study_id: int, db: Session = Depends(get_db)):
    study = study_service.get_study(db, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="Étude introuvable.")
    return cycle_service.list_cycles_for_study(db, study_id)
