"""
Service métier : notifications externes (email SMTP + Telegram) pour les
alertes capteurs.

Appelé UNIQUEMENT au moment où une alerte passe à l'état "active" pour
la première fois (voir app.services.alert_service._upsert_active_alert,
branche de création) — jamais à chaque tentative de collecte tant que
rien n'a changé, pour éviter de spammer l'opérateur.

Les deux canaux (email, Telegram) sont indépendants : chacun est un
no-op silencieux si sa configuration (.env) est incomplète, et une
erreur d'envoi sur un canal n'empêche jamais l'autre de s'exécuter ni
n'interrompt le cycle de collecte appelant. Toute erreur est
uniquement journalisée (app.utils.logger).
"""

import smtplib
from email.mime.text import MIMEText

import requests

from app.config import settings
from app.models.sensor_alert import SensorAlert
from app.utils.logger import get_logger

logger = get_logger(__name__)


def _format_alert_message(alert: SensorAlert) -> str:
    sensor_set = alert.sensor_set if alert.sensor_set is not None else "n/a"
    return (
        f"Sensor alert triggered\n\n"
        f"Type: {alert.alert_type}\n"
        f"Sensor set: {sensor_set}\n"
        f"Severity: {alert.severity}\n"
        f"Consecutive failures: {alert.consecutive_count}\n"
        f"Study ID: {alert.study_id if alert.study_id is not None else 'n/a'}\n"
        f"Created at (UTC): {alert.created_at}\n\n"
        f"{alert.message}"
    )


# --------------------------------------------------------------------------
# Email (SMTP)
# --------------------------------------------------------------------------
def _smtp_configured() -> bool:
    return bool(
        settings.SMTP_HOST
        and settings.SMTP_PORT
        and settings.SMTP_FROM_EMAIL
        and settings.ALERT_EMAIL_RECIPIENTS
    )


def send_email_alert(alert: SensorAlert) -> None:
    """Sends an email summarizing `alert` to every configured recipient.

    No-op (with a debug log) if SMTP is not configured. Never raises:
    any failure is logged and swallowed so the caller (the collector)
    keeps running.
    """
    if not _smtp_configured():
        logger.debug("SMTP non configuré — notification email ignorée.")
        return

    try:
        subject = f"[Water Quality] Alert: {alert.alert_type} (set {alert.sensor_set or 'n/a'})"
        body = _format_alert_message(alert)

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = ", ".join(settings.alert_email_recipients)

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.sendmail(
                settings.SMTP_FROM_EMAIL,
                settings.alert_email_recipients,
                msg.as_string(),
            )

        logger.info(
            "Notification email envoyée pour l'alerte id=%s (%s) à %s",
            alert.id, alert.alert_type, settings.alert_email_recipients,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Échec de l'envoi de la notification email pour l'alerte id=%s : %s",
            alert.id, exc,
        )


# --------------------------------------------------------------------------
# Telegram
# --------------------------------------------------------------------------
def _telegram_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID)


def send_telegram_alert(alert: SensorAlert) -> None:
    """Sends a Telegram message summarizing `alert` via the Bot API.

    No-op (with a debug log) if Telegram is not configured. Never
    raises: any failure is logged and swallowed so the caller (the
    collector) keeps running.
    """
    if not _telegram_configured():
        logger.debug("Telegram non configuré — notification Telegram ignorée.")
        return

    try:
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
        text = _format_alert_message(alert)
        response = requests.post(
            url,
            json={"chat_id": settings.TELEGRAM_CHAT_ID, "text": text},
            timeout=10,
        )
        response.raise_for_status()
        logger.info(
            "Notification Telegram envoyée pour l'alerte id=%s (%s).",
            alert.id, alert.alert_type,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Échec de l'envoi de la notification Telegram pour l'alerte id=%s : %s",
            alert.id, exc,
        )


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def notify_new_alert(alert: SensorAlert) -> None:
    """Fires every configured notification channel for a newly-created
    active alert. Each channel is independently optional and a failure
    on one never prevents the other from running."""
    send_email_alert(alert)
    send_telegram_alert(alert)
