"""
Fonctions de calcul scientifique en mémoire (aucune écriture en base :
ce service est un consommateur pur de l'API stockage).

Couvre :
    - Statistiques descriptives (min/max/moyenne/médiane/écart-type/quartiles)
    - Corrélation Pearson / Spearman
    - Détection de valeurs aberrantes (IQR, Z-score)
    - Tendance par moyenne mobile (rolling average)
    - Rapport de qualité des données (taux de complétude, trous)
    - Histogramme / boxplot (bins prêts pour affichage)
"""

from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

NUMERIC_PARAMETERS = ["ph", "temperature", "ec", "turbidity", "do"]


def to_dataframe(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["created_at", *NUMERIC_PARAMETERS, "set_number", "study_id"])
    df = pd.DataFrame(rows)
    if "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce", utc=True)
        df = df.sort_values("created_at")
    for col in NUMERIC_PARAMETERS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# --------------------------------------------------------------------------
# Statistiques descriptives
# --------------------------------------------------------------------------
def descriptive_stats(values: pd.Series) -> dict:
    clean = values.dropna()
    if clean.empty:
        return {
            "count": 0, "min": None, "max": None, "mean": None, "median": None,
            "std": None, "q1": None, "q3": None, "iqr": None,
        }
    q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
    return {
        "count": int(clean.count()),
        "min": float(clean.min()),
        "max": float(clean.max()),
        "mean": round(float(clean.mean()), 4),
        "median": float(clean.median()),
        "std": round(float(clean.std(ddof=1)), 4) if clean.count() > 1 else None,
        "q1": q1,
        "q3": q3,
        "iqr": round(q3 - q1, 4),
    }


def global_statistics(df: pd.DataFrame) -> dict:
    result = {}
    for param in NUMERIC_PARAMETERS:
        if param in df.columns:
            result[param] = descriptive_stats(df[param])
    result["total_rows"] = int(len(df))
    if "created_at" in df.columns and not df.empty:
        result["date_range"] = {
            "from": df["created_at"].min().isoformat() if pd.notna(df["created_at"].min()) else None,
            "to": df["created_at"].max().isoformat() if pd.notna(df["created_at"].max()) else None,
        }
    return result


# --------------------------------------------------------------------------
# Corrélations
# --------------------------------------------------------------------------
def correlation_matrix(df: pd.DataFrame, method: str = "pearson") -> dict:
    cols = [c for c in NUMERIC_PARAMETERS if c in df.columns]
    sub = df[cols].dropna(how="all")
    if sub.shape[0] < 2:
        return {"parameters": cols, "matrix": [], "method": method}

    if method == "spearman":
        corr = sub.corr(method="spearman")
    else:
        corr = sub.corr(method="pearson")

    corr = corr.round(4).fillna(0)
    return {"parameters": cols, "matrix": corr.values.tolist(), "method": method}


def pairwise_correlation(df: pd.DataFrame, param_a: str, param_b: str) -> dict:
    sub = df[[param_a, param_b]].dropna()
    if len(sub) < 3:
        return {"pearson_r": None, "pearson_p": None, "spearman_r": None, "spearman_p": None, "n": len(sub)}
    pear_r, pear_p = scipy_stats.pearsonr(sub[param_a], sub[param_b])
    spear_r, spear_p = scipy_stats.spearmanr(sub[param_a], sub[param_b])
    return {
        "pearson_r": round(float(pear_r), 4),
        "pearson_p": round(float(pear_p), 6),
        "spearman_r": round(float(spear_r), 4),
        "spearman_p": round(float(spear_p), 6),
        "n": int(len(sub)),
    }


# --------------------------------------------------------------------------
# Détection de valeurs aberrantes
# --------------------------------------------------------------------------
def outliers_iqr(values: pd.Series) -> dict:
    clean = values.dropna()
    if len(clean) < 4:
        return {"outlier_indices": [], "lower_bound": None, "upper_bound": None, "count": 0}
    q1, q3 = clean.quantile(0.25), clean.quantile(0.75)
    iqr = q3 - q1
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    mask = (clean < lower) | (clean > upper)
    return {
        "outlier_indices": clean[mask].index.tolist(),
        "lower_bound": round(float(lower), 4),
        "upper_bound": round(float(upper), 4),
        "count": int(mask.sum()),
    }


def outliers_zscore(values: pd.Series, threshold: float = 3.0) -> dict:
    clean = values.dropna()
    if len(clean) < 2 or clean.std(ddof=1) == 0:
        return {"outlier_indices": [], "count": 0, "threshold": threshold}
    z = (clean - clean.mean()) / clean.std(ddof=1)
    mask = z.abs() > threshold
    return {"outlier_indices": clean[mask].index.tolist(), "count": int(mask.sum()), "threshold": threshold}


# --------------------------------------------------------------------------
# Tendance (moyenne mobile)
# --------------------------------------------------------------------------
def rolling_average(df: pd.DataFrame, parameter: str, window: int = 5) -> list[dict]:
    if parameter not in df.columns or df.empty:
        return []
    sub = df[["created_at", parameter]].dropna()
    if sub.empty:
        return []
    sub = sub.copy()
    sub["rolling"] = sub[parameter].rolling(window=window, min_periods=1).mean()
    return [
        {"created_at": row["created_at"].isoformat(), "value": row[parameter], "rolling_avg": round(float(row["rolling"]), 4)}
        for _, row in sub.iterrows()
    ]


# --------------------------------------------------------------------------
# Qualité des données
# --------------------------------------------------------------------------
def data_quality_report(df: pd.DataFrame) -> dict:
    total = len(df)
    report = {"total_rows": total, "parameters": {}}
    for param in NUMERIC_PARAMETERS:
        if param not in df.columns:
            continue
        missing = int(df[param].isna().sum())
        completeness = round(100 * (total - missing) / total, 2) if total else None
        report["parameters"][param] = {
            "missing": missing,
            "present": total - missing,
            "completeness_pct": completeness,
        }

    if "created_at" in df.columns and total > 1:
        gaps = df["created_at"].diff().dropna()
        if not gaps.empty:
            median_gap = gaps.median()
            large_gaps = gaps[gaps > median_gap * 3]
            report["gaps"] = {
                "median_interval_seconds": median_gap.total_seconds(),
                "large_gap_count": int(len(large_gaps)),
            }
    return report


# --------------------------------------------------------------------------
# Histogramme / Boxplot (prêts à tracer)
# --------------------------------------------------------------------------
def histogram(values: pd.Series, bins: int = 20) -> dict:
    clean = values.dropna()
    if clean.empty:
        return {"bin_edges": [], "counts": []}
    counts, edges = np.histogram(clean, bins=bins)
    return {"bin_edges": [round(float(e), 4) for e in edges], "counts": counts.tolist()}


def boxplot_summary(values: pd.Series) -> dict:
    clean = values.dropna()
    if clean.empty:
        return {"min": None, "q1": None, "median": None, "q3": None, "max": None, "outliers": []}
    q1, median, q3 = clean.quantile(0.25), clean.quantile(0.5), clean.quantile(0.75)
    iqr = q3 - q1
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    whisker_min = clean[clean >= lower].min()
    whisker_max = clean[clean <= upper].max()
    outliers = clean[(clean < lower) | (clean > upper)].tolist()
    return {
        "min": float(whisker_min), "q1": float(q1), "median": float(median),
        "q3": float(q3), "max": float(whisker_max),
        "outliers": [round(float(o), 4) for o in outliers][:200],
    }


def pca_analysis(df: pd.DataFrame, n_components: int = 2) -> dict:
    cols = [c for c in NUMERIC_PARAMETERS if c in df.columns]
    clean = df[cols].dropna()
    if clean.shape[0] < 3 or clean.shape[1] < 2:
        return {"error": "Données insuffisantes pour une ACP (au moins 3 relevés et 2 paramètres requis)."}

    n_components = min(n_components, clean.shape[1], clean.shape[0])
    X = StandardScaler().fit_transform(clean.values)
    pca = PCA(n_components=n_components)
    components = pca.fit_transform(X)

    created_at = df.loc[clean.index, "created_at"] if "created_at" in df.columns else None
    set_numbers = df.loc[clean.index, "set_number"] if "set_number" in df.columns else None

    return {
        "explained_variance_ratio": [round(float(v), 4) for v in pca.explained_variance_ratio_],
        "components": [
            {
                "created_at": created_at.iloc[i].isoformat() if created_at is not None and pd.notna(created_at.iloc[i]) else None,
                "set_number": int(set_numbers.iloc[i]) if set_numbers is not None and pd.notna(set_numbers.iloc[i]) else None,
                **{f"PC{j+1}": round(float(components[i, j]), 4) for j in range(n_components)},
            }
            for i in range(clean.shape[0])
        ],
        "loadings": {
            param: [round(float(v), 4) for v in pca.components_[:, i]]
            for i, param in enumerate(cols)
        },
    }