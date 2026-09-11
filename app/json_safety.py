"""
Sécurité JSON globale.

Certains calculs statistiques (écart-type d'un groupe à une seule
valeur, % d'abattement avec un dénominateur proche de zéro, ACP sur des
données quasi-colinéaires...) peuvent produire des `NaN` ou `Infinity`
en Python. Le moteur JSON de Starlette (utilisé par FastAPI) refuse par
défaut de sérialiser ces valeurs (`allow_nan=False`), ce qui provoque
une erreur 500 même quand le calcul lui-même est correct.

`SafeJSONResponse` intercepte TOUTE réponse de l'API et remplace
récursivement chaque NaN/Infinity par `null`, avant sérialisation. Cela
évite d'avoir à traiter ce cas dans chaque service un par un, et protège
aussi les futurs endpoints.
"""

import math
from typing import Any

from fastapi.responses import JSONResponse


def sanitize_for_json(value: Any) -> Any:
    """Remplace récursivement NaN/Infinity/-Infinity par None."""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_for_json(v) for v in value]
    return value


class SafeJSONResponse(JSONResponse):
    """Réponse JSON par défaut de l'application : NaN/Infinity -> null."""

    def render(self, content: Any) -> bytes:
        return super().render(sanitize_for_json(content))
