"""
Configuration centralisée du logging de l'application.

Les logs sont écrits :
- dans la console (stdout)
- dans un fichier rotatif sous `logs/app.log`
"""

import logging
import os
from logging.handlers import RotatingFileHandler

from app.config import settings

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FILE = os.path.join(LOG_DIR, "app.log")

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def get_logger(name: str) -> logging.Logger:
    """Retourne un logger configuré (console + fichier rotatif)."""
    logger = logging.getLogger(name)

    if logger.handlers:
        # Logger déjà configuré -> éviter les doublons de handlers
        return logger

    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logger.setLevel(level)

    formatter = logging.Formatter(LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")

    # Console
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Fichier rotatif (5 Mo x 5 fichiers)
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    logger.propagate = False
    return logger
