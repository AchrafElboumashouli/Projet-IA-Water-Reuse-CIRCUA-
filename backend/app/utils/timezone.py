"""
Utilitaires de fuseau horaire centralisés.

Stratégie de l'application :
    - Toutes les données sont stockées en base PostgreSQL en UTC, dans des
      colonnes `TIMESTAMP WITH TIME ZONE` (aware). C'est la pratique
      recommandée : un TIMESTAMPTZ Postgres est toujours normalisé et stocké
      en UTC en interne, quel que soit le fuseau de la session.
    - Le fuseau "métier" (celui dans lequel les utilisateurs pensent et
      saisissent des dates : formulaires, imports Excel, logs, scheduler)
      est unique et configurable via la variable d'environnement
      `TIMEZONE` (voir `app/config.py`), par défaut "Africa/Casablanca".
    - Toute conversion entre "heure locale métier" et "instant UTC stocké"
      doit passer par les fonctions de ce module, afin qu'un changement de
      `TIMEZONE` dans la config se propage à toute l'application sans
      modification de code.

Règle générale :
    - Ce qui est stocké / échangé via l'API -> toujours UTC, aware.
    - Ce qui est saisi / affiché à un humain (formulaire, Excel, logs) ->
      toujours converti depuis/vers `settings.TIMEZONE`.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import settings

# Chargé une seule fois : c'est le SEUL endroit où `settings.TIMEZONE` est
# résolu en objet ZoneInfo. Tout le reste du code doit importer `APP_TZ`
# (ou utiliser les fonctions ci-dessous) plutôt que de relire
# `settings.TIMEZONE` directement.
APP_TZ = ZoneInfo(settings.TIMEZONE)
UTC = ZoneInfo("UTC")


def now_utc() -> datetime:
    """Instant présent, aware, en UTC. À utiliser pour tout `created_at` /
    `updated_at` / horodatage stocké en base (remplace `datetime.utcnow()`,
    qui retourne un datetime naïf et est déconseillé depuis Python 3.12)."""
    return datetime.now(UTC)


def now_local() -> datetime:
    """Instant présent, aware, dans le fuseau métier configuré
    (`settings.TIMEZONE`). À utiliser pour les logs et toute logique qui
    raisonne en "heure locale" (ex. bornes de journée)."""
    return datetime.now(APP_TZ)


def to_utc(value: datetime) -> datetime:
    """
    Convertit un datetime vers UTC (aware), prêt à être stocké.

    - Si `value` est naïf (pas de tzinfo, ex. une date saisie dans un
      formulaire ou lue d'un fichier Excel), il est interprété comme une
      heure locale dans le fuseau métier configuré (`settings.TIMEZONE`),
      puis converti en UTC.
    - Si `value` est déjà aware (ex. horodatage ThingSpeak déjà en UTC),
      il est simplement converti en UTC sans réinterprétation.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=APP_TZ)
    return value.astimezone(UTC)


def to_local(value: datetime) -> datetime:
    """
    Convertit un datetime aware (typiquement lu depuis la base, en UTC)
    vers le fuseau métier configuré, pour affichage/logs.

    Un datetime naïf est supposé être déjà en UTC (comportement de
    repli conservateur, ne devrait pas arriver pour des valeurs issues
    de colonnes `TIMESTAMP WITH TIME ZONE`).
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(APP_TZ)
