"""
Seuils de référence pour les cartes de conformité (normes marocaines vs
européennes) sur les paramètres du capteur multiparamètre temps réel
(ph, temperature, ec, turbidity, do).

⚠️ IMPORTANT — À VALIDER PAR LE CHEF DE PROJET :
Aucune valeur seuil officielle n'a été fournie pour ce PFE. Les valeurs
ci-dessous sont des valeurs INDICATIVES construites à partir de textes
réglementaires publics traitant de la réutilisation/qualité des eaux
(elles ne constituent pas un avis juridique) :

  Maroc :
    - pH            : NM 03.7.001 (eaux d'alimentation) / usage courant
                       laboratoire marocain : 6.5 - 8.5
    - Température   : Décret n° 2-97-787 (normes de qualité des eaux et
                       inventaire du degré de pollution) : seuil usuel
                       retenu pour rejet dans le milieu naturel : ≤ 30 °C
    - Conductivité   : Arrêté conjoint n° 1276-01 (qualité des eaux
      électrique (EC)  destinées à l'irrigation) : eau utilisable sans
                       restriction sévère jusqu'à ≈ 2700 µS/cm (classe
                       "restriction modérée" bornée à 3000 µS/cm)
    - Turbidité      : pas de seuil unique publié pour la réutilisation ;
                       valeur usuelle retenue pour un effluent secondaire
                       traité destiné à l'irrigation : ≤ 10 NTU
    - Oxygène dissous : pas de seuil réglementaire direct ; seuil usuel
                       de bon fonctionnement d'un traitement aérobie : ≥ 2 mg/L

  Europe :
    - pH            : Directive 91/271/CEE (eaux urbaines résiduaires),
                       plage usuelle de rejet : 6.0 - 9.0
    - Température    : pas de valeur unique UE ; valeur usuelle retenue
                       (protection milieu récepteur) : ≤ 30 °C
    - Conductivité   : pas de seuil harmonisé UE ; valeur usuelle
      électrique (EC)  citée en irrigation : ≤ 2000 µS/cm
    - Turbidité      : Règlement (UE) 2020/741 (réutilisation eaux
                       urbaines, classe A - cultures consommées crues) :
                       ≤ 5 NTU
    - Oxygène dissous : Directive cadre sur l'eau - bon état écologique :
                       objectif usuel ≥ 5 mg/L (seuil minimal ≥ 4 mg/L)

Ces valeurs sont centralisées ICI et modifiables sans toucher au reste
du code. Idéalement, à terme, elles devraient être éditables depuis un
écran de paramétrage (cf. TODO Section Alertes/Config).
"""

from typing import Optional, TypedDict


class Range(TypedDict, total=False):
    min: Optional[float]
    max: Optional[float]


# parameter -> { "morocco": {min,max}, "europe": {min,max}, "unit": str, "label": str }
NORMS: dict[str, dict] = {
    "ph": {
        "label": "pH",
        "unit": "",
        "morocco": {"min": 6.5, "max": 8.5},
        "europe": {"min": 6.0, "max": 9.0},
    },
    "temperature": {
        "label": "Température",
        "unit": "°C",
        "morocco": {"min": None, "max": 30.0},
        "europe": {"min": None, "max": 30.0},
    },
    "ec": {
        "label": "Conductivité électrique (EC)",
        "unit": "µS/cm",
        "morocco": {"min": None, "max": 2700.0},
        "europe": {"min": None, "max": 2000.0},
    },
    "turbidity": {
        "label": "Turbidité",
        "unit": "NTU",
        "morocco": {"min": None, "max": 10.0},
        "europe": {"min": None, "max": 5.0},
    },
    "do": {
        "label": "Oxygène dissous (DO)",
        "unit": "mg/L",
        "morocco": {"min": 2.0, "max": None},
        "europe": {"min": 5.0, "max": None},
    },
}

PARAMETER_KEYS = list(NORMS.keys())


def _in_range(value: Optional[float], rng: Range) -> Optional[bool]:
    if value is None:
        return None
    lo = rng.get("min")
    hi = rng.get("max")
    if lo is not None and value < lo:
        return False
    if hi is not None and value > hi:
        return False
    return True


def evaluate_parameter(parameter: str, value: Optional[float]) -> dict:
    """
    Retourne la conformité d'une valeur pour un paramètre donné :
    { morocco_ok, europe_ok, status } avec status parmi :
      "both"      -> conforme aux deux normes
      "morocco"   -> conforme seulement à la norme marocaine
      "europe"    -> conforme seulement à la norme européenne
      "none"      -> non conforme aux deux
      "unknown"   -> valeur manquante ou paramètre non défini
    """
    spec = NORMS.get(parameter)
    if spec is None or value is None:
        return {"morocco_ok": None, "europe_ok": None, "status": "unknown"}

    morocco_ok = _in_range(value, spec["morocco"])
    europe_ok = _in_range(value, spec["europe"])

    if morocco_ok and europe_ok:
        status = "both"
    elif morocco_ok:
        status = "morocco"
    elif europe_ok:
        status = "europe"
    else:
        status = "none"

    return {"morocco_ok": morocco_ok, "europe_ok": europe_ok, "status": status}
