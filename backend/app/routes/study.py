"""
Routes API : système d'étude (/api/study).

Endpoints :
    - POST   /api/study                              -> créer une étude
    - GET    /api/study                               -> lister les études
    - GET    /api/study/{id}                          -> détail d'une étude
    - DELETE /api/study/{id}                          -> supprimer définitivement une étude (les cycles associés restent en base ; seule l'association study_cycles est retirée ; raw_sensor_data préservé, study_id -> NULL)
    - GET    /api/study/{id}/export                    -> export CSV des mesures brutes de cette étude (filtré par study_id ; date et set_number optionnels)
    - POST   /api/study/{id}/assign                   -> assigner des mesures brutes existantes à une étude
    - GET    /api/study/{id}/cycles                   -> lister les cycles associés à une étude
    - POST   /api/study/{id}/cycles/{cycle_id}/import -> associer ("Import Existing Cycle") un cycle déjà existant à cette étude
    - DELETE /api/study/{id}/cycles/{cycle_id}         -> retirer (unassign) un cycle de cette étude SANS le supprimer (seule l'association study_cycles est retirée)
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_db
from app.schemas.cycle import CycleImportIntoStudyResponse, CycleSummaryOut
from app.schemas.cycle_import import CycleImportResult
from app.schemas.study import StudyAssignResponse, StudyCreate, StudyOut
from app.services import cycle_import_service, cycle_service, study_service
from app.utils.logger import get_logger
from app.utils.timezone import to_utc

logger = get_logger(__name__)

router = APIRouter(prefix="/api/study", tags=["Studies"])


def _validate_set_number(set_number: int) -> None:
    """See app.routes.raw_data._validate_set_number: `set_number` bounds
    now depend on the configured sensor sets rather than a fixed 1..2."""
    if set_number not in settings.valid_set_numbers:
        raise HTTPException(
            status_code=400,
            detail=f"set_number invalide : {set_number}. Sets configurés : {settings.valid_set_numbers}.",
        )


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


@router.get("/{study_id}", response_model=StudyOut, summary="Détail d'une étude")
def get_study(study_id: int, db: Session = Depends(get_db)):
    study = study_service.get_study(db, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="Étude introuvable.")
    return study


@router.get(
    "/{study_id}/export",
    summary="Exporter au format CSV les mesures brutes rattachées à cette étude",
)
def export_study_results(
    study_id: int,
    start_date: Optional[datetime] = Query(
        default=None,
        description="Filtre optionnel : date/heure de début (ISO 8601). Par défaut, aucune borne basse.",
    ),
    end_date: Optional[datetime] = Query(
        default=None,
        description="Filtre optionnel : date/heure de fin (ISO 8601). Par défaut, aucune borne haute.",
    ),
    set_number: Optional[int] = Query(
        default=None,
        description="Filtre optionnel : numéro du set de capteurs (voir /api/sensor-sets). Par défaut, tous les sets confondus.",
    ),
    db: Session = Depends(get_db),
):
    """
    Exporte au format CSV les mesures brutes (`raw_sensor_data`)
    RATTACHÉES À CETTE ÉTUDE : la condition `RawSensorData.study_id ==
    study_id` est toujours appliquée en premier. `start_date`,
    `end_date` et `set_number` sont des filtres additionnels
    optionnels pour affiner l'export (ex. une sous-période, ou un seul
    set de capteurs) — ils ne remplacent jamais le filtre par étude.

    Avant cette correction, cet endpoint ne filtrait QUE par date et
    set_number, sans jamais vérifier `study_id` : il pouvait donc
    exporter des mesures appartenant à une autre étude, ou non
    assignées à aucune étude, dès lors qu'elles tombaient dans
    l'intervalle de dates fourni.

    La colonne `time` (minutes écoulées depuis la première mesure du
    jeu de données exporté) est recalculée automatiquement.

    Retourne 404 si l'étude n'existe pas.
    """
    study = study_service.get_study(db, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="Étude introuvable.")

    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date doit être postérieure ou égale à start_date.")
    if set_number is not None:
        _validate_set_number(set_number)

    # Query params may arrive naive (e.g. an ISO string with no offset,
    # representing a wall-clock time in the app's business timezone) or
    # already UTC-aware; `to_utc` normalizes either case before comparing
    # against `raw_sensor_data.created_at`, which is always stored in UTC.
    if start_date is not None:
        start_date = to_utc(start_date)
    if end_date is not None:
        end_date = to_utc(end_date)

    try:
        buffer = study_service.export_study_results_csv(
            db,
            study_id=study_id,
            start_date=start_date,
            end_date=end_date,
            set_number=set_number,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de l'export CSV : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la génération de l'export CSV.")

    set_stamp = f"_set{set_number}" if set_number is not None else ""
    range_stamp = ""
    if start_date is not None:
        range_stamp += f"_{start_date.strftime('%Y%m%d-%H%M')}"
    if end_date is not None:
        range_stamp += f"_{end_date.strftime('%Y%m%d-%H%M')}"
    filename = f"study{study_id}_export{set_stamp}{range_stamp}.csv"

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{study_id}/assign",
    response_model=StudyAssignResponse,
    summary="Assigner des mesures brutes existantes à une étude",
)
def assign_study(
    study_id: int,
    set_number: int = Query(..., description="Numéro du set de capteurs (voir /api/sensor-sets)"),
    db: Session = Depends(get_db),
):
    """
    Lie les mesures brutes de `raw_sensor_data` correspondant à la période
    de l'étude (et au set de capteurs donné) en mettant à jour leur
    `study_id`. Remplace l'ancien endpoint `/populate`, qui dupliquait les
    données dans une table séparée (`study_results`, supprimée).
    """
    _validate_set_number(set_number)
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


@router.delete(
    "/{study_id}",
    status_code=204,
    summary="Supprimer définitivement une étude",
)
def delete_study(study_id: int, db: Session = Depends(get_db)):
    """
    Supprime définitivement l'étude. Par cascade ON DELETE CASCADE sur
    `study_cycles.study_id` (voir app/models/study_cycle.py), seules les
    lignes d'ASSOCIATION Study<->Cycle de cette étude sont retirées : les
    cycles eux-mêmes, leurs `cycle_results` et leur `cycle_plants` restent
    intacts en base et restent utilisables par toute autre étude qui leur
    est déjà associée, ou importables plus tard via "Import Existing
    Cycle". Les mesures brutes (`raw_sensor_data`) de l'étude ne sont
    JAMAIS supprimées : leur `study_id` passe simplement à NULL (ON
    DELETE SET NULL, voir app/models/raw_sensor_data.py). Retourne 404 si
    l'étude n'existe pas/plus, 500 en cas d'erreur inattendue lors de la
    suppression.
    """
    try:
        deleted = study_service.delete_study(db, study_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la suppression de l'étude %s : %s", study_id, exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la suppression de l'étude.")

    if not deleted:
        raise HTTPException(status_code=404, detail="Étude introuvable.")


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


@router.post(
    "/{study_id}/cycles/{cycle_id}/import",
    response_model=CycleImportIntoStudyResponse,
    summary="Importer/réutiliser un cycle existant (n'importe lequel) dans cette étude",
)
def import_existing_cycle(study_id: int, cycle_id: int, db: Session = Depends(get_db)):
    """
    Rattache ("Import Existing Cycle") un cycle déjà présent en base — SANS
    filtre : le cycle peut déjà être utilisé par une ou plusieurs autres
    études, ou par aucune — à cette étude, SANS dupliquer le cycle : une
    ligne est simplement ajoutée à la table d'association `study_cycles`
    (voir app/models/study_cycle.py). `cycle_results` et `cycle_plants`
    restent inchangés, et toute autre étude déjà associée à ce cycle garde
    sa propre association intacte (voir
    cycle_service.import_cycle_into_study). Retourne 404 si l'étude ou le
    cycle n'existe pas, 409 si le cycle est déjà associé à CETTE étude.
    """
    try:
        cycle = cycle_service.import_cycle_into_study(db, study_id=study_id, cycle_id=cycle_id)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "introuvable" in message else 409
        raise HTTPException(status_code=status_code, detail=message)
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Erreur lors de l'import du cycle %s dans l'étude %s : %s", cycle_id, study_id, exc
        )
        raise HTTPException(status_code=500, detail="Erreur interne lors de l'import du cycle.")

    return CycleImportIntoStudyResponse(
        cycle=cycle, message="Cycle imported successfully."
    )


@router.delete(
    "/{study_id}/cycles/{cycle_id}",
    status_code=204,
    summary="Retirer (unassign) un cycle de cette étude, sans le supprimer",
)
def remove_cycle_from_study(study_id: int, cycle_id: int, db: Session = Depends(get_db)):
    """
    "Delete" button on a Study's Cycles page: removes ONLY the
    Study<->Cycle association (the `study_cycles` row for this pair) —
    it does NOT delete the Cycle. The Cycle itself, its `cycle_results`,
    and its `cycle_plants` remain fully intact in the database, and any
    other Study currently associated with the same Cycle (e.g. Study 2 ->
    Cycle A) keeps its own association completely untouched.

    After this call, the Cycle is no longer listed under this Study's
    Cycles page, but it stays visible/importable from any other Study
    that already used it, and remains available via "Import Existing
    Cycle" everywhere (see cycle_service.remove_cycle_from_study).

    Returns 404 if the Study, the Cycle, or this specific association
    does not exist.
    """
    study = study_service.get_study(db, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="Étude introuvable.")

    try:
        removed = cycle_service.remove_cycle_from_study(db, study_id=study_id, cycle_id=cycle_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Erreur lors du retrait du cycle %s de l'étude %s : %s", cycle_id, study_id, exc
        )
        raise HTTPException(
            status_code=500, detail="Erreur interne lors du retrait du cycle de l'étude."
        )

    if not removed:
        raise HTTPException(
            status_code=404,
            detail="Ce cycle n'est pas associé à cette étude.",
        )


@router.post(
    "/{study_id}/cycles/import",
    response_model=CycleImportResult,
    summary="Importer des cycles depuis un fichier Excel (.xlsx)",
)
async def import_study_cycles(
    study_id: int,
    file: UploadFile = File(..., description="Fichier .xlsx contenant les cycles à importer"),
    skip_duplicates: bool = Query(
        default=True,
        description="Si vrai (par défaut), ignore les cycles dont le nom existe déjà pour cette étude.",
    ),
    db: Session = Depends(get_db),
):
    """
    Importe un ou plusieurs cycles de laboratoire depuis un fichier Excel.

    Seul le format .xlsx (Excel moderne) est accepté : la lecture utilise
    `pandas.read_excel(..., engine="openpyxl")`, qui ne supporte pas le
    format binaire historique .xls. Un fichier .xls sera rejeté avec une
    erreur 400 explicite plutôt que d'échouer silencieusement ou de
    produire une erreur de parsing peu claire.

    Colonnes attendues (une ligne par réplicat) : Cycle Name, Start Date,
    End Date, Parameter, Plant, Replicate, Value (voir
    app/services/cycle_import_service.py pour les alias de colonnes
    acceptés, y compris l'ancienne colonne "Stage" pour compatibilité).
    Les dates supportent le format DD/MM/YYYY HH:mm. Les lignes invalides
    sont reportées dans la réponse sans interrompre le reste de l'import.
    """
    study = study_service.get_study(db, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="Étude introuvable.")

    filename = (file.filename or "").lower()
    if not filename.endswith(".xlsx"):
        raise HTTPException(
            status_code=400,
            detail="Le fichier doit être au format .xlsx (le format .xls n'est pas supporté).",
        )

    file_bytes = await file.read()

    try:
        return cycle_import_service.import_cycles_from_excel(
            db, study_id=study_id, file_bytes=file_bytes, skip_duplicates=skip_duplicates
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de l'import Excel des cycles (étude %s) : %s", study_id, exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de l'import Excel.")
