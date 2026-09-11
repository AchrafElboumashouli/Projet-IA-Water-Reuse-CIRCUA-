"""
Comparaisons scientifiques (module 4 du besoin fonctionnel + module C
"reporting des études" du cahier des charges) :

    - IN (Wastewater) vs OUT CONTROL (Control Series) vs OUT PLANT
      (Planted Series) : statistique descriptive, EDA, ANOVA + Tukey HSD,
      PCA, sur un ou plusieurs cycles d'une étude.
    - Comparaison entre sets de capteurs temps réel (SET 1 vs SET 2).

Rappel de la correspondance (cf. cahier des charges, section "Module de
chargement multiparamètres") :
    IN          <-> stage "Wastewater"      (première mesure, eau usée brute)
    OUT CONTROL <-> stage "Control Series"  (sortie de la série sans plante)
    OUT PLANT   <-> stage "Planted Series"  (sortie de la série avec plante)
"""

from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

STAGE_LABELS = {
    "Wastewater": "IN",
    "Control Series": "OUT_CONTROL",
    "Planted Series": "OUT_PLANT",
}

CYCLE_PARAMETERS = ["COD (mg/L)", "BOD (mg/L)", "TSS (mg/L)", "pH", "Temperature (°C)", "EC (µS/cm)", "Turbidity (NTU)", "DO (mg/L)"]


def cycles_to_long_dataframe(cycles: list[dict]) -> pd.DataFrame:
    """
    Transforme une liste de cycles (avec leurs `results`, tels que
    retournés par GET /api/cycles/{id} ou reconstitués via
    /api/study/{id}/cycles + /api/cycles/{id}) en DataFrame "long" :
    une ligne par (cycle_id, parameter, stage, replicate_index, value).
    """
    records = []
    for cycle in cycles:
        for row in cycle.get("results", []):
            for i in (1, 2, 3):
                value = row.get(f"replicate_{i}")
                if value is None:
                    continue
                records.append(
                    {
                        "cycle_id": cycle["id"],
                        "cycle_name": cycle.get("cycle_name"),
                        "parameter": row["parameter"],
                        "stage": row["stage"],
                        "stage_label": STAGE_LABELS.get(row["stage"], row["stage"]),
                        "replicate": i,
                        "value": value,
                    }
                )
    return pd.DataFrame.from_records(records)


def descriptive_by_stage(df: pd.DataFrame, parameter: str) -> dict:
    sub = df[df["parameter"] == parameter]
    result = {}
    for stage, label in STAGE_LABELS.items():
        vals = sub[sub["stage"] == stage]["value"].dropna()
        if vals.empty:
            result[label] = {"count": 0}
            continue
        result[label] = {
            "count": int(vals.count()),
            "mean": round(float(vals.mean()), 4),
            "std": round(float(vals.std(ddof=1)), 4) if vals.count() > 1 else None,
            "min": float(vals.min()),
            "max": float(vals.max()),
        }
    return result


def anova_tukey(df: pd.DataFrame, parameter: str) -> dict:
    """
    ANOVA à un facteur (stage) suivie d'un test post-hoc de Tukey HSD,
    pour valider (ou non) l'hypothèse d'une différence significative
    entre IN, OUT CONTROL et OUT PLANT.
    """
    sub = df[df["parameter"] == parameter].dropna(subset=["value"])
    groups = {stage: sub[sub["stage"] == stage]["value"].values for stage in STAGE_LABELS}
    groups = {STAGE_LABELS[s]: v for s, v in groups.items() if len(v) >= 2}

    if len(groups) < 2:
        return {"error": "Données insuffisantes pour ANOVA (au moins 2 groupes avec ≥2 valeurs requis)."}

    f_stat, p_value = scipy_stats.f_oneway(*groups.values())

    tukey_result = None
    try:
        from statsmodels.stats.multicomp import pairwise_tukeyhsd

        values = np.concatenate(list(groups.values()))
        labels = np.concatenate([[name] * len(v) for name, v in groups.items()])
        tukey = pairwise_tukeyhsd(values, labels, alpha=0.05)
        tukey_result = [
            {
                "group1": str(row[0]), "group2": str(row[1]),
                "meandiff": float(row[2]), "p_adj": float(row[3]),
                "lower": float(row[4]), "upper": float(row[5]),
                "reject_h0": bool(row[6]),
            }
            for row in tukey._results_table.data[1:]
        ]
    except ImportError:
        tukey_result = {"error": "statsmodels non installé : Tukey HSD indisponible."}

    return {
        "parameter": parameter,
        "groups": list(groups.keys()),
        "anova_f_statistic": round(float(f_stat), 4),
        "anova_p_value": round(float(p_value), 6),
        "significant_difference": bool(p_value < 0.05),
        "tukey_hsd": tukey_result,
    }


def pca_analysis(df: pd.DataFrame, n_components: int = 2) -> dict:
    """
    ACP sur la moyenne des réplicats par (cycle, stage) pour expliquer la
    variance des données entre paramètres/étapes.
    """
    pivot = (
        df.groupby(["cycle_id", "stage_label", "parameter"])["value"]
        .mean()
        .reset_index()
        .pivot_table(index=["cycle_id", "stage_label"], columns="parameter", values="value")
    )
    pivot = pivot.dropna(axis=0, how="any")
    if pivot.shape[0] < 3 or pivot.shape[1] < 2:
        return {"error": "Données insuffisantes pour une ACP (au moins 3 observations et 2 paramètres requis)."}

    n_components = min(n_components, pivot.shape[1], pivot.shape[0])
    X = StandardScaler().fit_transform(pivot.values)
    pca = PCA(n_components=n_components)
    components = pca.fit_transform(X)

    return {
        "explained_variance_ratio": [round(float(v), 4) for v in pca.explained_variance_ratio_],
        "components": [
            {
                "cycle_id": int(idx[0]),
                "stage": idx[1],
                **{f"PC{i+1}": round(float(components[row_i, i]), 4) for i in range(n_components)},
            }
            for row_i, idx in enumerate(pivot.index)
        ],
        "loadings": {
            param: [round(float(v), 4) for v in pca.components_[:, i]]
            for i, param in enumerate(pivot.columns)
        },
    }


# --------------------------------------------------------------------------
# Comparaison SET 1 vs SET 2 (données temps réel)
# --------------------------------------------------------------------------
def compare_sets(df_set1: pd.DataFrame, df_set2: pd.DataFrame, parameter: str) -> dict:
    a = df_set1[parameter].dropna() if parameter in df_set1.columns else pd.Series(dtype=float)
    b = df_set2[parameter].dropna() if parameter in df_set2.columns else pd.Series(dtype=float)

    if len(a) < 2 or len(b) < 2:
        return {"error": "Données insuffisantes pour comparer les deux sets."}

    t_stat, p_value = scipy_stats.ttest_ind(a, b, equal_var=False)
    return {
        "parameter": parameter,
        "set1": {"count": int(len(a)), "mean": round(float(a.mean()), 4), "std": round(float(a.std(ddof=1)), 4)},
        "set2": {"count": int(len(b)), "mean": round(float(b.mean()), 4), "std": round(float(b.std(ddof=1)), 4)},
        "t_statistic": round(float(t_stat), 4),
        "p_value": round(float(p_value), 6),
        "significant_difference": bool(p_value < 0.05),
    }


# --------------------------------------------------------------------------
# Statistiques globales complètes — TOUS les paramètres d'un cycle/étude
# --------------------------------------------------------------------------
def _extended_stats(values: pd.Series) -> dict:
    """
    Bloc de statistiques complet pour une série de valeurs (un paramètre,
    toutes stages confondues ou un stage donné) :
        - Statistiques descriptives classiques (min/max/moyenne/médiane/
          écart-type/quartiles/IQR)
        - Coefficient de variation (CV %) : dispersion relative, utile
          pour comparer des paramètres d'échelles très différentes
          (ex. pH ~7 vs COD ~400 mg/L)
        - Intervalle de confiance à 95% de la moyenne (utile pour
          présenter un résultat scientifique avec sa marge d'erreur)
        - Asymétrie (skewness) et aplatissement (kurtosis) : forme de la
          distribution (utile pour savoir si une moyenne seule suffit à
          résumer les données, ou si la distribution est très étalée /
          a des valeurs extrêmes)
        - Test de normalité de Shapiro-Wilk (n < 5000) : indique si les
          données suivent une distribution normale, condition théorique
          de validité de l'ANOVA/test t utilisés ailleurs dans le
          dashboard
        - Nombre de valeurs aberrantes (règle IQR x1.5)
    """
    clean = values.dropna()
    n = int(clean.count())
    if n == 0:
        return {"count": 0}

    result: dict = {
        "count": n,
        "min": round(float(clean.min()), 4),
        "max": round(float(clean.max()), 4),
        "mean": round(float(clean.mean()), 4),
        "median": round(float(clean.median()), 4),
    }

    if n > 1:
        std = float(clean.std(ddof=1))
        result["std"] = round(std, 4)
        mean = float(clean.mean())
        result["cv_percent"] = round(100 * std / mean, 2) if mean != 0 else None

        # Intervalle de confiance 95% de la moyenne (loi de Student)
        sem = std / (n ** 0.5)
        t_crit = float(scipy_stats.t.ppf(0.975, df=n - 1))
        result["ci95_lower"] = round(float(mean - t_crit * sem), 4)
        result["ci95_upper"] = round(float(mean + t_crit * sem), 4)
    else:
        result["std"] = None
        result["cv_percent"] = None
        result["ci95_lower"] = None
        result["ci95_upper"] = None

    q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
    iqr = q3 - q1
    result["q1"] = round(q1, 4)
    result["q3"] = round(q3, 4)
    result["iqr"] = round(iqr, 4)

    lower_bound, upper_bound = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    result["outlier_count"] = int(((clean < lower_bound) | (clean > upper_bound)).sum())

    if n >= 3:
        result["skewness"] = round(float(clean.skew()), 4)
        result["kurtosis"] = round(float(clean.kurtosis()), 4)
    else:
        result["skewness"] = None
        result["kurtosis"] = None

    if 3 <= n <= 5000:
        try:
            shapiro_stat, shapiro_p = scipy_stats.shapiro(clean)
            result["normality_test"] = {
                "method": "shapiro_wilk",
                "statistic": round(float(shapiro_stat), 4),
                "p_value": round(float(shapiro_p), 6),
                "is_normal_distribution": bool(shapiro_p > 0.05),
            }
        except ValueError:
            result["normality_test"] = None
    else:
        result["normality_test"] = None

    return result


def global_stats_all_parameters(df: pd.DataFrame) -> dict:
    """
    Statistiques globales complètes pour LES 8 PARAMÈTRES du cycle,
    à la fois toutes stages confondues ("overall") et détaillées par
    stage (IN / OUT_CONTROL / OUT_PLANT), pour une étude ou un cycle
    donné (selon le filtrage déjà appliqué au DataFrame en amont).
    """
    result = {}
    for parameter in CYCLE_PARAMETERS:
        sub = df[df["parameter"] == parameter]
        if sub.empty:
            continue

        by_stage = {}
        for stage, label in STAGE_LABELS.items():
            stage_values = sub[sub["stage"] == stage]["value"]
            by_stage[label] = _extended_stats(stage_values)

        result[parameter] = {
            "overall": _extended_stats(sub["value"]),
            "by_stage": by_stage,
        }
    return result


# --------------------------------------------------------------------------
# Boxplot / Histogramme / Heatmap — analyse scientifique par paramètre
# --------------------------------------------------------------------------
def boxplot_by_stage(df: pd.DataFrame, parameter: str) -> dict:
    """
    Résumé boxplot (min/Q1/médiane/Q3/max + valeurs aberrantes) pour un
    paramètre, un boxplot par stage (IN / OUT_CONTROL / OUT_PLANT), pour
    affichage côte à côte (comparaison visuelle immédiate de l'effet du
    traitement sur la distribution des valeurs, pas seulement la moyenne).
    """
    sub = df[df["parameter"] == parameter]
    result = {}
    for stage, label in STAGE_LABELS.items():
        result[label] = _box_stats(sub[sub["stage"] == stage]["value"])
    return {"parameter": parameter, "boxplots": result}


def _box_stats(clean: pd.Series) -> Optional[dict]:
    """Statistiques boxplot (whiskers IQR x1.5) pour une série de valeurs."""
    clean = clean.dropna()
    if clean.empty:
        return None
    q1, median, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.5)), float(clean.quantile(0.75))
    iqr = q3 - q1
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    whisker_min = clean[clean >= lower].min()
    whisker_max = clean[clean <= upper].max()
    outliers = clean[(clean < lower) | (clean > upper)]
    return {
        "min": round(float(whisker_min), 4),
        "q1": round(q1, 4),
        "median": round(median, 4),
        "q3": round(q3, 4),
        "max": round(float(whisker_max), 4),
        "outliers": [round(float(o), 4) for o in outliers][:100],
        "n": int(clean.count()),
    }


def _elimination_by_stage(df: pd.DataFrame, parameter: str) -> dict:
    """
    % d'élimination (removal) par stage, calculé CYCLE PAR CYCLE puis
    moyenné (moyenne ± écart-type sur les cycles), plutôt qu'un seul
    removal global sur les moyennes poolées — plus rigoureux
    statistiquement, et permet d'afficher une barre d'erreur cohérente
    avec le reste du dashboard (cf. maquette de référence).
    """
    sub = df[df["parameter"] == parameter]
    per_cycle = sub.groupby(["cycle_id", "stage"])["value"].mean().reset_index()
    wide = per_cycle.pivot(index="cycle_id", columns="stage", values="value")

    result = {}
    if "Wastewater" not in wide.columns:
        return result

    for stage, label in STAGE_LABELS.items():
        if stage == "Wastewater" or stage not in wide.columns:
            continue
        removal = ((wide["Wastewater"] - wide[stage]) / wide["Wastewater"] * 100).replace([np.inf, -np.inf], np.nan).dropna()
        if removal.empty:
            continue
        result[label] = {
            "mean": round(float(removal.mean()), 2),
            "std": round(float(removal.std(ddof=1)), 2) if len(removal) > 1 else None,
            "n_cycles": int(len(removal)),
        }
    return result


def parameter_summary(df: pd.DataFrame, parameter: str) -> dict:
    """
    Vue "carte par paramètre" tout-en-un : boxplot (3 stages) + moyenne
    ± écart-type par stage + ANOVA/Tukey + % d'élimination (témoin et
    plantée), en un seul appel — c'est ce qui alimente chaque carte de
    l'onglet "Par cycle" du dashboard (une carte par paramètre, avec
    toutes les annotations scientifiques dessus).
    """
    return {
        "parameter": parameter,
        "boxplot": boxplot_by_stage(df, parameter)["boxplots"],
        "descriptive": descriptive_by_stage(df, parameter),
        "anova": anova_tukey(df, parameter),
        "elimination": _elimination_by_stage(df, parameter),
    }


def progression_by_cycle(df: pd.DataFrame, parameter: str) -> dict:
    """
    Boxplot du paramètre, DÉCOMPOSÉ cycle par cycle (un mini-boxplot par
    stage x par cycle), trié par ordre chronologique des cycles — pour
    visualiser si l'efficacité du traitement (plantée notamment)
    s'améliore, se stabilise ou se dégrade au fil des cycles successifs.
    """
    sub = df[df["parameter"] == parameter]
    cycle_order = (
        sub[["cycle_id", "cycle_name"]]
        .drop_duplicates()
        .sort_values("cycle_id")
    )

    cycles_out = []
    for _, row in cycle_order.iterrows():
        cid = row["cycle_id"]
        cycle_df = sub[sub["cycle_id"] == cid]
        boxplots = {}
        for stage, label in STAGE_LABELS.items():
            boxplots[label] = _box_stats(cycle_df[cycle_df["stage"] == stage]["value"])
        cycles_out.append({"cycle_id": int(cid), "cycle_name": row["cycle_name"], "boxplots": boxplots})

    return {"parameter": parameter, "cycles": cycles_out}


def histogram_by_stage(df: pd.DataFrame, parameter: str, bins: int = 15) -> dict:
    """
    Histogramme (comptages par intervalle) pour un paramètre, une série
    par stage superposable (IN / OUT_CONTROL / OUT_PLANT) sur le même
    axe, pour visualiser le déplacement de la distribution après
    traitement.
    """
    sub = df[df["parameter"] == parameter]["value"].dropna()
    if sub.empty:
        return {"parameter": parameter, "bin_edges": [], "series": {}}

    global_min, global_max = float(sub.min()), float(sub.max())
    edges = np.linspace(global_min, global_max, bins + 1) if global_min != global_max else np.array([global_min, global_min + 1])

    series = {}
    for stage, label in STAGE_LABELS.items():
        clean = df[(df["parameter"] == parameter) & (df["stage"] == stage)]["value"].dropna()
        if clean.empty:
            series[label] = None
            continue
        counts, _ = np.histogram(clean, bins=edges)
        series[label] = counts.tolist()

    return {
        "parameter": parameter,
        "bin_edges": [round(float(e), 4) for e in edges],
        "series": series,
    }


def parameter_correlation_heatmap(df: pd.DataFrame, method: str = "pearson") -> dict:
    """
    Matrice de corrélation entre les 8 paramètres du cycle (moyenne des
    réplicats par (cycle, stage) comme unité d'observation), pour
    repérer des relations entre paramètres (ex. COD et BOD souvent très
    corrélés, DO qui varie en sens inverse de la turbidité...).
    """
    wide = (
        df.groupby(["cycle_id", "stage_label", "parameter"])["value"]
        .mean()
        .reset_index()
        .pivot_table(index=["cycle_id", "stage_label"], columns="parameter", values="value")
    )

    cols = [p for p in CYCLE_PARAMETERS if p in wide.columns]
    wide = wide[cols].dropna(how="all")

    if wide.shape[0] < 3 or len(cols) < 2:
        return {"error": "Données insuffisantes pour une heatmap de corrélation (au moins 3 observations et 2 paramètres requis)."}

    corr = wide.corr(method="pearson" if method != "spearman" else "spearman").round(4).fillna(0)
    return {"parameters": cols, "matrix": corr.values.tolist(), "method": method, "n_observations": int(wide.shape[0])}
