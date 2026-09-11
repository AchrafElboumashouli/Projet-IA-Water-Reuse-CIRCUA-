"""
Module des anomalies (module E du cahier des charges) :

    - Z-score       : anomalie ponctuelle univariée (par paramètre)
    - Isolation Forest : anomalie multivariée (les 5 paramètres capteur
                          ensemble), capture les combinaisons inhabituelles
    - Autoencoder   : reconstruit chaque échantillon multivarié ; une
                      erreur de reconstruction élevée = anomalie. Implémenté
                      avec un MLPRegressor (bottleneck) de scikit-learn afin
                      d'éviter une dépendance lourde (PyTorch/TensorFlow)
                      tout en gardant le principe algorithmique d'un
                      autoencodeur (compression -> reconstruction).

Toutes les fonctions sont "stateless" : le modèle est ré-entraîné à la
volée sur la fenêtre de données demandée (pas de persistance de modèle
pour cette v1 — cf. README pour les pistes d'amélioration : checkpoints,
ré-entraînement planifié, etc.)
"""

from typing import Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

from app.config import settings
from app.services.calculations import NUMERIC_PARAMETERS


# --------------------------------------------------------------------------
# Z-score (univarié, par paramètre)
# --------------------------------------------------------------------------
def zscore_anomalies(df: pd.DataFrame, parameter: str, threshold: Optional[float] = None) -> list[dict]:
    threshold = threshold or settings.ZSCORE_THRESHOLD
    if parameter not in df.columns:
        return []
    sub = df[["created_at", parameter]].dropna()
    if len(sub) < 2 or sub[parameter].std(ddof=1) == 0:
        return []

    z = (sub[parameter] - sub[parameter].mean()) / sub[parameter].std(ddof=1)
    anomalies = sub[z.abs() > threshold].copy()
    anomalies["z_score"] = z[z.abs() > threshold].round(3)

    return [
        {
            "created_at": row["created_at"].isoformat(),
            "parameter": parameter,
            "value": float(row[parameter]),
            "z_score": float(row["z_score"]),
            "method": "zscore",
        }
        for _, row in anomalies.iterrows()
    ]


# --------------------------------------------------------------------------
# Isolation Forest (multivarié)
# --------------------------------------------------------------------------
def isolation_forest_anomalies(df: pd.DataFrame, contamination: Optional[float] = None) -> list[dict]:
    contamination = contamination or settings.ISOLATION_FOREST_CONTAMINATION
    cols = [c for c in NUMERIC_PARAMETERS if c in df.columns]
    sub = df[["created_at", *cols]].dropna()
    if len(sub) < settings.ANOMALY_MIN_POINTS:
        return []

    X = sub[cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(contamination=contamination, random_state=42, n_estimators=200)
    labels = model.fit_predict(X_scaled)  # -1 = anomalie
    scores = model.decision_function(X_scaled)  # plus bas = plus anormal

    sub = sub.copy()
    sub["label"] = labels
    sub["score"] = scores

    anomalies = sub[sub["label"] == -1]
    return [
        {
            "created_at": row["created_at"].isoformat(),
            "values": {c: float(row[c]) for c in cols},
            "anomaly_score": round(float(row["score"]), 4),
            "method": "isolation_forest",
        }
        for _, row in anomalies.iterrows()
    ]


# --------------------------------------------------------------------------
# Autoencoder (MLPRegressor bottleneck) — anomalie = erreur de reconstruction
# --------------------------------------------------------------------------
def autoencoder_anomalies(df: pd.DataFrame, error_percentile: Optional[float] = None) -> list[dict]:
    error_percentile = error_percentile or settings.AUTOENCODER_ERROR_PERCENTILE
    cols = [c for c in NUMERIC_PARAMETERS if c in df.columns]
    sub = df[["created_at", *cols]].dropna()
    if len(sub) < settings.ANOMALY_MIN_POINTS:
        return []

    X = sub[cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n_features = X_scaled.shape[1]
    bottleneck = max(1, n_features // 2)

    model = MLPRegressor(
        hidden_layer_sizes=(max(bottleneck * 2, 2), bottleneck, max(bottleneck * 2, 2)),
        activation="relu",
        solver="adam",
        max_iter=800,
        random_state=42,
        early_stopping=True,
    )
    model.fit(X_scaled, X_scaled)
    reconstructed = model.predict(X_scaled)

    reconstruction_error = np.mean((X_scaled - reconstructed) ** 2, axis=1)
    threshold = np.percentile(reconstruction_error, error_percentile)

    sub = sub.copy()
    sub["reconstruction_error"] = reconstruction_error

    anomalies = sub[sub["reconstruction_error"] > threshold]
    return [
        {
            "created_at": row["created_at"].isoformat(),
            "values": {c: float(row[c]) for c in cols},
            "reconstruction_error": round(float(row["reconstruction_error"]), 5),
            "threshold": round(float(threshold), 5),
            "method": "autoencoder",
        }
        for _, row in anomalies.iterrows()
    ]


# --------------------------------------------------------------------------
# Événements d'anomalies unifiés — pour le calendrier (Journal, module 6)
# --------------------------------------------------------------------------
def detect_anomaly_events(df: pd.DataFrame, set_number: int) -> list[dict]:
    """
    Exécute les 3 méthodes de détection (Z-score par paramètre,
    Isolation Forest, Autoencoder) sur la même fenêtre de données, et
    retourne une liste UNIFIÉE d'événements avec :
        - la méthode responsable (zscore | isolation_forest | autoencoder)
        - une cause lisible par un humain (pour affichage dans le
          calendrier du Journal, au clic sur un jour)
        - la sévérité retenue pour la coloration du calendrier :
          "critical" (rouge) pour Isolation Forest et Autoencoder,
          plus fiables car multivariés (ils regardent tous les
          paramètres ensemble) ; "warning" (orange) pour le Z-score,
          plus sensible mais univarié (peut réagir à une seule valeur
          isolée sans que la mesure soit réellement problématique).
    """
    events: list[dict] = []

    for parameter in NUMERIC_PARAMETERS:
        for a in zscore_anomalies(df, parameter):
            events.append(
                {
                    "created_at": a["created_at"],
                    "set_number": set_number,
                    "method": "zscore",
                    "severity": "warning",
                    "cause": (
                        f"SET {set_number} — {parameter} : valeur {a['value']} anormalement "
                        f"éloignée de la moyenne (z-score = {a['z_score']}, seuil = {settings.ZSCORE_THRESHOLD})."
                    ),
                }
            )

    for a in isolation_forest_anomalies(df):
        values_str = ", ".join(f"{k}={v}" for k, v in a["values"].items())
        events.append(
            {
                "created_at": a["created_at"],
                "set_number": set_number,
                "method": "isolation_forest",
                "severity": "critical",
                "cause": (
                    f"SET {set_number} — combinaison de valeurs inhabituelle détectée "
                    f"par Isolation Forest ({values_str}), score = {a['anomaly_score']}."
                ),
            }
        )

    for a in autoencoder_anomalies(df):
        values_str = ", ".join(f"{k}={v}" for k, v in a["values"].items())
        events.append(
            {
                "created_at": a["created_at"],
                "set_number": set_number,
                "method": "autoencoder",
                "severity": "critical",
                "cause": (
                    f"SET {set_number} — erreur de reconstruction élevée par l'autoencodeur "
                    f"({values_str}) : {a['reconstruction_error']} > seuil {a['threshold']}."
                ),
            }
        )

    return events


# --------------------------------------------------------------------------
# Dérive (drift) entre sets de capteurs
# --------------------------------------------------------------------------
def drift_between_sets(df_set1: pd.DataFrame, df_set2: pd.DataFrame) -> dict:
    """
    Compare les distributions d'un même paramètre entre SET 1 et SET 2 sur
    la même période via un test de Kolmogorov-Smirnov (détecte un
    changement de distribution = dérive d'un capteur par rapport à l'autre)
    et l'écart de moyenne.
    """
    from scipy import stats as scipy_stats

    result = {}
    for param in NUMERIC_PARAMETERS:
        if param not in df_set1.columns or param not in df_set2.columns:
            continue
        a = df_set1[param].dropna()
        b = df_set2[param].dropna()
        if len(a) < 5 or len(b) < 5:
            result[param] = {"status": "insufficient_data"}
            continue
        ks_stat, p_value = scipy_stats.ks_2samp(a, b)
        mean_diff = float(a.mean() - b.mean())
        result[param] = {
            "ks_statistic": round(float(ks_stat), 4),
            "p_value": round(float(p_value), 6),
            "mean_diff_set1_minus_set2": round(mean_diff, 4),
            "drift_detected": bool(p_value < 0.05),
        }
    return result
