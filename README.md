# Water Quality Monitoring — Service MONITORING (Tâche 2 / Aya)

Backend **FastAPI** du module de monitoring intelligent de la qualité des
eaux usées traitées. Ce service est **indépendant** du backend de
l'équipe stockage (`backend_equipe_stockage`) : il ne s'y connecte **que
via son API REST** et n'ouvre **jamais** de connexion PostgreSQL directe.

```
Frontend (Next.js, :3001)
        │  HTTP / WebSocket
        ▼
Service MONITORING (FastAPI, :8001)   <-- CE PROJET
        │  HTTP uniquement (storage_client.py)
        ▼
Backend STOCKAGE (FastAPI, :8000) ──── PostgreSQL
```

## 1. Installation

```bash
cd monitoring_backend
python -m venv venv
source venv/bin/activate          # Windows : venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Configuration

```bash
copy .env.example .env            # Windows
cp .env.example .env              # macOS/Linux
```

La seule variable réellement critique est `STORAGE_API_BASE_URL` : elle
doit pointer vers le backend de l'équipe stockage (par défaut
`http://localhost:8000`). **Ce service ne doit jamais recevoir de
`DATABASE_URL`** — s'il n'a aucune donnée à afficher, vérifiez d'abord
que le backend stockage tourne bien sur le port configuré.

## 3. Lancement

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Documentation interactive : http://localhost:8001/docs

Healthcheck général : `GET /` — vérifie que l'API stockage est bien
joignable : `GET /health/storage`.

## 4. Organisation du code

```
app/
  main.py               Point d'entrée FastAPI + WebSocket /ws/live
  config.py             Configuration (.env)
  norms_config.py       Seuils de conformité MA/EU (À VALIDER, cf. en-tête du fichier)
  storage_client.py     SEULE couche d'accès aux données (HTTP vers l'API stockage)
  poller.py             Boucle de fond : détecte les nouvelles mesures, pousse en WebSocket
  routes/
    raw_data.py          Monitoring temps réel + historique + conformité (module 1)
    analytics.py          Statistiques globales + EDA : histogramme/corrélation/boxplot/timeline (modules 2-3)
    anomalies.py           Détection intelligente (Z-score/Isolation Forest/Autoencoder) + drift + comparaison sets (modules 4-5)
    alerts.py                Alertes captures nulles (proxy stockage) + Journal/calendrier (modules 5-6)
    studies.py                 Études, cycles, comparaison IN vs OUT_CONTROL vs OUT_PLANT (ANOVA/Tukey/PCA) (modules 4/7/8)
    export.py                   Tableau de données complet + export CSV (module 9)
  services/
    calculations.py       Stats descriptives, corrélations, IQR/Z-score, moyenne mobile, qualité des données
    anomaly_service.py    Z-score, Isolation Forest, Autoencoder (MLPRegressor bottleneck), drift KS-test
    comparison_service.py IN/OUT_CONTROL/OUT_PLANT : descriptif, ANOVA+Tukey, PCA ; comparaison SET1 vs SET2
    journal_service.py    Agrégation des alertes par jour civil (calendrier)
```

## 5. Correspondance avec le cahier des charges

| Module du CdC                                   | Endpoints                                    |
|--------------------------------------------------|-----------------------------------------------|
| 1. Monitoring temps réel + normes                | `/api/monitoring/raw-data/*`                  |
| 2. Statistiques globales                          | `/api/monitoring/analytics/global-stats`      |
| 3. Analyse scientifique (histo/corr/boxplot/...)  | `/api/monitoring/analytics/*`                 |
| 4. Comparaison sets & IN/OUT_CONTROL/OUT_PLANT    | `/api/monitoring/anomalies/compare-sets`, `/api/monitoring/studies/{id}/comparison/*` |
| 5. Alertes (anomalies + captures nulles)          | `/api/monitoring/anomalies/*`, `/api/monitoring/alerts/*` |
| 6. Journal (calendrier)                           | `/api/monitoring/alerts/calendar*`            |
| 7. Qualité de l'eau                               | `/api/monitoring/raw-data/quality-report` + `/norms` |
| 8. Études & Cycles                                | `/api/monitoring/studies/*`                   |
| 9. Tableau de données + export                    | `/api/monitoring/data-table*`                 |

## 6. Points d'attention / pistes d'amélioration (à discuter avec le chef de projet)

- **Seuils de conformité (Maroc/Europe)** : `app/norms_config.py` contient
  des valeurs **indicatives** (sourcées en en-tête du fichier), aucune
  valeur officielle n'ayant été fournie. À faire valider puis, idéalement,
  à rendre éditables depuis l'UI (comme le seuil de captures nulles côté
  stockage).
- **Anomalies (Isolation Forest / Autoencoder)** : modèles ré-entraînés
  à la volée sur la fenêtre de données demandée (pas de persistance de
  modèle/checkpoints pour cette v1 — cf. besoin fonctionnel D du CdC sur
  les checkpoints, à prévoir pour le module de prévision LSTM, non traité
  ici car hors périmètre "monitoring" au sens strict).
- **Filtrage par date sur `raw-data`** : l'API stockage ne filtre pas
  nativement par date ; `storage_client.fetch_raw_data_range()` pagine et
  filtre côté monitoring (garde-fous `STORAGE_PAGE_SIZE`/`STORAGE_MAX_PAGES`
  dans `config.py` à ajuster si le volume de données grossit beaucoup).
- **Prévisions LSTM** (module D du CdC) : non implémentées dans ce lot
  (dashboard des modules 1 à 9 demandés) — à ajouter dans un module
  `forecast_service.py` séparé si besoin.
