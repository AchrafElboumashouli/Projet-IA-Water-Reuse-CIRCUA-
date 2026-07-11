# Water Quality Monitoring – Backend (Tâche 1)

Backend **FastAPI + PostgreSQL** pour le stockage et le prétraitement des
données brutes de capteurs de qualité de l'eau (pH, température, EC,
turbidité, DO) provenant de **ThingSpeak**.

## 1. Architecture

```
backend/
├── app/
│   ├── main.py                # Point d'entrée FastAPI + scheduler
│   ├── config.py              # Configuration (.env)
│   ├── models/                 # Modèles SQLAlchemy (ORM)
│   │   ├── raw_sensor_data.py
│   │   ├── study.py
│   │   └── study_result.py
│   ├── schemas/                 # Schémas Pydantic (validation/serialisation)
│   │   ├── raw_data.py
│   │   └── study.py
│   ├── services/                # Logique métier
│   │   ├── raw_data_service.py
│   │   └── study_service.py
│   ├── collectors/               # Collecteur ThingSpeak
│   │   └── collector.py
│   ├── routes/                   # Endpoints FastAPI
│   │   ├── raw_data.py
│   │   └── study.py
│   ├── database/
│   │   └── session.py           # Connexion SQLAlchemy
│   └── utils/
│       └── logger.py            # Logging
├── alembic/                      # Migrations de base de données
│   ├── env.py
│   └── versions/
├── alembic.ini
├── requirements.txt
├── .env.example
└── logs/                          # Logs applicatifs (app.log)
```

## 2. Installation

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows : venv\Scripts\activate
pip install -r requirements.txt
```

## 3. Configuration

Copier le fichier d'exemple et adapter les valeurs :

```bash
cp .env.example .env
```

Variables principales :

| Variable                        | Description                                           |
|----------------------------------|--------------------------------------------------------|
| `DATABASE_URL`                   | URL de connexion PostgreSQL                            |
| `THINGSPEAK_CHANNEL_SET1_ID`      | ID du channel ThingSpeak SET 1 (par défaut `3111290`)  |
| `THINGSPEAK_CHANNEL_SET2_ID`      | ID du channel ThingSpeak SET 2 (par défaut `3243723`)  |
| `THINGSPEAK_READ_API_KEY_SET1/2`  | Clé API de lecture (si le channel est privé)           |
| `COLLECTOR_INTERVAL_MINUTES`      | Intervalle de collecte automatique (minutes)           |
| `THINGSPEAK_RESULTS_COUNT`        | Nombre de résultats récupérés par appel ThingSpeak     |

## 4. Création de la base de données

Créer la base PostgreSQL (exemple) :

```bash
createdb water_quality_db
```

Appliquer les migrations Alembic :

```bash
alembic upgrade head
```

- `0001_initial` crée `raw_sensor_data`, `studies`, `study_results`.
- `0002_study_centric` refactorise l'architecture autour de `studies` :
  ajoute `raw_sensor_data.study_id` (FK, `ON DELETE SET NULL`), backfille
  ce champ depuis `study_results`, crée `cycles` et `cycle_results`
  (`ON DELETE CASCADE`), puis supprime `study_results` (devenue
  redondante). Aucune mesure brute n'est perdue dans l'opération.

## 5. Lancement de l'application

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Au démarrage :
- Une collecte ThingSpeak est exécutée immédiatement.
- Le scheduler APScheduler exécute ensuite la collecte toutes les
  `COLLECTOR_INTERVAL_MINUTES` minutes.

Documentation interactive : http://localhost:8000/docs

## 6. Collecte manuelle (sans lancer le serveur)

```bash
python -m app.collectors.collector
```

## 7. Endpoints disponibles

### Données brutes

| Méthode | URL                              | Description                              |
|---------|------------------------------------|-------------------------------------------|
| GET     | `/api/raw-data`                    | Liste paginée des données brutes          |
| GET     | `/api/raw-data/latest`             | Dernière mesure (par set ou tous sets)    |
| GET     | `/api/raw-data/set/{set_number}`   | Données pour un set donné (1 ou 2)        |

### Études

| Méthode | URL                                       | Description                                  |
|---------|---------------------------------------------|------------------------------------------------|
| POST    | `/api/study`                                | Créer une étude                                |
| GET     | `/api/study`                                | Lister les études                              |
| GET     | `/api/study/{id}`                           | Détail d'une étude                             |
| POST    | `/api/study/{id}/assign?set_number=1`       | Assigner (`study_id`) les mesures brutes existantes à l'étude |
| GET     | `/api/study/{id}/cycles`                    | Lister les cycles de laboratoire de l'étude    |
| GET     | `/api/study/export`                         | Export CSV (`start_date`, `end_date`, `plant_type`, `set_number`) |

### Cycles de laboratoire

| Méthode | URL                       | Description                                          |
|---------|----------------------------|--------------------------------------------------------|
| GET     | `/api/meta`                | Paramètres et étapes attendus pour un cycle (24 lignes) |
| POST    | `/api/cycles`               | Créer un cycle + résultats calculés (moyenne/std/removal %) |
| GET     | `/api/cycles/{cycle_id}`   | Détail d'un cycle avec sa table de résultats complète  |

### Divers

| Méthode | URL              | Description                          |
|---------|-------------------|----------------------------------------|
| GET     | `/`               | Healthcheck                            |
| POST    | `/api/collect`    | Déclencher une collecte ThingSpeak manuelle |

## 8. Flux de travail typique pour une étude

1. Créer une étude :
   ```bash
   curl -X POST http://localhost:8000/api/study \
        -H "Content-Type: application/json" \
        -d '{"study_name": "Etude Tomate 1", "plant_type": "tomate", "start_date": "2025-01-01", "end_date": "2025-01-15"}'
   ```
2. Assigner les mesures brutes déjà collectées à l'étude (lien direct
   via `study_id`, aucune copie de données) :
   ```bash
   curl -X POST "http://localhost:8000/api/study/1/assign?set_number=1"
   ```
3. Exporter en CSV :
   ```bash
   curl "http://localhost:8000/api/study/export?start_date=2025-01-01&end_date=2025-01-15&plant_type=tomate&set_number=1" -o export.csv
   ```
4. Enregistrer un cycle de laboratoire (formulaire manuel, résultats
   calculés automatiquement) :
   ```bash
   curl -X POST http://localhost:8000/api/cycles \
        -H "Content-Type: application/json" \
        -d '{"study_id": 1, "cycle_name": "Cycle 1", "start_date": "2025-01-01", "end_date": "2025-01-15", "rows": [...]}'
   ```

## 9. Gestion des erreurs & logs

- Toutes les routes sont encapsulées dans des blocs `try/except` et
  retournent des erreurs HTTP explicites (400/404/500).
- Un gestionnaire d'exception global capture toute erreur non prévue.
- Les logs sont écrits dans la console et dans `logs/app.log`
  (rotation automatique : 5 fichiers de 5 Mo).
