# Water Quality Monitoring — Backend

FastAPI service for the Smart Water Quality System. It (a) polls
ThingSpeak on a schedule to ingest raw sensor data into PostgreSQL,
including a one-time full-history backfill per configured channel,
(b) exposes a REST API for studies and reusable laboratory cycles,
(c) computes cycle statistics (average, standard deviation, removal %),
(d) supports importing cycles in bulk from Excel, and (e) detects and
records alerts when data collection fails or sensors report degenerate
readings.

For the system-wide picture (how this talks to the frontend, full data
flow, functional/technical architecture diagrams) see the
[root README](../README.md). For the Next.js UI, see
[`frontend/README.md`](../frontend/README.md).

## 1. Technology stack

| Layer                | Technology                                  |
|------------------------|-----------------------------------------------|
| Framework                | FastAPI 0.110, Uvicorn 0.27 (`uvicorn[standard]`) |
| ORM                      | SQLAlchemy 2.0.27                             |
| Validation                | Pydantic 2.6 / `pydantic-settings` 2.1        |
| Database                  | PostgreSQL (driver: `psycopg2-binary` 2.9)   |
| Migrations                | Alembic 1.13                                  |
| Scheduling                 | APScheduler 3.10 (`BackgroundScheduler`, in-process) |
| Data processing            | pandas 2.2 + openpyxl 3.1 (Excel import, CSV export) |
| Outbound HTTP               | `requests` 2.31 (ThingSpeak, Telegram Bot API) |
| Email                       | Python standard library `smtplib` / `email.mime.text` |
| Config loading               | `python-dotenv` via `pydantic-settings`, reading `.env` |
| Multipart uploads             | `python-multipart` (Excel file uploads)      |
| Timezone data                 | `tzdata`                                      |

See `requirements.txt` for exact pinned versions.

## 2. Installation

```bash
cd backend
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — at minimum set DATABASE_URL to a real PostgreSQL instance

createdb water_quality_db           # or create the DB by your usual means
alembic upgrade head                # applies the consolidated migration
```

Run the dev server:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs are auto-generated at `http://localhost:8000/docs` (Swagger)
and `/redoc`.

## 3. Configuration (`.env`)

All settings are loaded by `app/config.py::Settings` (a
`pydantic-settings` `BaseSettings`) from `.env` (see `.env.example` for
a complete template with inline comments, and `.env.test` for a
second, currently-unused environment template — see §11, "Testing").
Required values without a default cause startup to fail fast with a
clear Pydantic error rather than silently falling back to a hard-coded
value.

| Variable                     | Required | Purpose                                                                                     |
|--------------------------------|:---------:|-------------------------------------------------------------------------------------------------|
| `DATABASE_URL`                   | yes        | PostgreSQL connection string                                                                     |
| `APP_NAME`                       | yes        | Used in the FastAPI app title and the `/` healthcheck response                                    |
| `LOG_LEVEL`                       | yes        | Python logging level (e.g. `INFO`)                                                                |
| `CORS_ORIGINS`                    | yes        | JSON array of origins allowed to call the API from a browser                                      |
| `THINGSPEAK_BASE_URL`             | yes        | Base URL for the ThingSpeak REST API                                                              |
| `SENSOR_SETS`                     | yes        | JSON array of `{set_number, channel_id, api_key}` objects — one per ThingSpeak channel to collect from |
| `COLLECTOR_INTERVAL_MINUTES`      | yes        | Minutes between recurring collector runs                                                          |
| `THINGSPEAK_RESULTS_COUNT`        | yes        | Number of rows requested per recurring collection call (max 8000; the startup backfill ignores this and pages through full history instead) |
| `TIMEZONE`                        | yes        | IANA business timezone used for naive-datetime conversion, scheduler logs, and display (e.g. `Africa/Casablanca`) |
| `NULL_CAPTURE_THRESHOLD`          | yes        | Default consecutive-failure threshold for alerts; overridden at runtime once `PUT /api/alerts/config` has been called at least once |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM_EMAIL` / `SMTP_USE_TLS` / `ALERT_EMAIL_RECIPIENTS` | no | Email alert notifications; silently disabled if `SMTP_HOST`, `SMTP_FROM_EMAIL`, or `ALERT_EMAIL_RECIPIENTS` is unset |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | no | Telegram alert notifications; both must be set or they're silently disabled |

`Settings` also exposes derived properties used throughout the code:
`sensor_sets` (parsed `SensorSetConfig` list), `channel_map`
(`set_number -> {channel_id, api_key}`), `valid_set_numbers` (replaces
old hardcoded `ge=1, le=2` bounds on `set_number` query params — the
number of configured sets is fully dynamic), and
`alert_email_recipients` (parsed, trimmed list from the comma-separated
`ALERT_EMAIL_RECIPIENTS`).

## 4. Application structure

```
backend/
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 0001_initial_consolidated.py
├── alembic.ini
├── app/
│   ├── main.py                 # FastAPI app, lifespan (backfill + scheduler), CORS, error handler
│   ├── config.py                # Settings (pydantic-settings)
│   ├── collectors/
│   │   └── collector.py          # ThingSpeakCollector, collect_all(), backfill_all()
│   ├── database/
│   │   └── session.py             # SQLAlchemy engine/session, declarative Base
│   ├── models/                    # SQLAlchemy ORM classes (see §9)
│   ├── routes/                    # FastAPI routers (see §10)
│   ├── schemas/                   # Pydantic request/response models + domain constants
│   ├── services/                  # Business logic (see §8)
│   └── utils/
│       ├── logger.py
│       └── timezone.py              # to_utc(), now_utc(), APP_TZ
├── logs/
├── requirements.txt
├── .env.example
└── .env.test                       # prepared template, not wired into any test runner
```

## 5. `app/main.py` — application wiring

- Builds the FastAPI `app` with a `lifespan` context manager:
  - **Startup**: registers the recurring `scheduled_collection_job`
    (interval = `COLLECTOR_INTERVAL_MINUTES`) on an in-process
    `BackgroundScheduler`, starts the scheduler, then runs
    `backfill_all()` **once** to pull each sensor set's entire
    available ThingSpeak history, then runs `collect_all()` once
    immediately so the app has fresh data without waiting for the
    first scheduled tick.
  - **Shutdown**: stops the scheduler (`wait=False`).
- Registers `CORSMiddleware` with `allow_origins=settings.CORS_ORIGINS`,
  all methods/headers allowed, credentials allowed.
- Registers a global `Exception` handler that logs the full request
  context and returns a generic `500 {"detail": "..."}` body, so
  internal errors are never leaked to clients.
- Mounts the four routers: `raw_data`, `study`, `cycle`, `alerts`.
- Exposes three extra top-level endpoints directly (not in a router):
  - `GET /` — healthcheck (`{"status": "ok", "app": ..., "version": "1.0.0"}`)
  - `GET /api/sensor-sets` — the currently configured sensor sets
    (`set_number` + `channel_id`), so the frontend can build labels/
    filters dynamically instead of hardcoding "Set 1"/"Set 2"
  - `GET /api/scheduler` — scheduler status and each job's
    `next_run_time`
  - `POST /api/collect` — triggers an immediate manual collection
    (outside the schedule)

## 6. `app/collectors/collector.py` — ThingSpeak collection

`ThingSpeakCollector` implements the fetch → clean → store pipeline
shared by two entry points:

- **`collect_all()`** — the recurring/manual path. For each configured
  sensor set, fetches the most recent `THINGSPEAK_RESULTS_COUNT`
  entries, cleans them into a pandas `DataFrame` (renaming
  `field1..field5` to `ph/temperature/ec/turbidity/do`, coercing types,
  dropping rows with no timestamp/entry id), and stores them via
  `INSERT ... ON CONFLICT DO NOTHING` keyed on `(entry_id,
  set_number)` — idempotent by construction. Runs the `no_data`
  detector per set, then the `capture_failure` detector once across
  all sets.
- **`backfill_all()`** — runs once, only at backend startup (see
  `main.py`). Pulls the **entire** available history for every
  configured sensor set via `ThingSpeakCollector.run_backfill()` →
  `fetch_all_feeds()` → the same `clean_feeds()`/`store()` path, so it
  can never produce duplicates. `fetch_all_feeds()` paginates
  **backward in time from "now"** using the `end` query parameter
  (instead of paginating forward with `start`), because when
  `results` is combined with a `start`/`end` range containing more
  entries than `results`, ThingSpeak returns the entries closest to
  `end` — a forward-paginating implementation would keep re-fetching
  the same recent window and never reach older data while appearing to
  finish. The backward implementation:
  - starts with no `end` (→ "now") and re-requests with `end` set to
    the earliest `created_at` seen in the previous page (inclusive)
    until a page comes back empty or shorter than the requested page
    size;
  - deduplicates entries by `entry_id` across pages (the inclusive
    `end` boundary can return the same edge entry twice) and never
    assumes ThingSpeak's `last_entry_id` equals the total row count;
  - guards against a stalled/looping fetch and a hard `max_pages` cap,
    logging and stopping cleanly instead of looping forever.

  Because `store()` upserts on `(entry_id, set_number)`, `backfill_all()`
  is idempotent and safe to re-run manually (e.g. `python -c "from
  app.collectors.collector import backfill_all; print(backfill_all())"`)
  — a re-run after a completed backfill inserts nothing new.

## 7. Services (`app/services/`)

| File                        | Responsibility                                                                                            |
|-------------------------------|----------------------------------------------------------------------------------------------------------------|
| `study_service.py`             | Study CRUD, **study deletion** (never cascades to cycles — see §9), raw-data assignment (`assign_raw_data_to_study`, in-place `UPDATE`, never copies rows), CSV export (`export_study_results_csv`, recomputes an elapsed-`time` column) |
| `cycle_service.py`             | Cycle read (`get_cycle`, `list_cycles_for_study`, `list_all_cycles` — every cycle, unfiltered), cycle reuse (`import_cycle_into_study`, `remove_cycle_from_study` — pure `study_cycles` row add/remove), calculations (`build_cycle_results`), cycle creation (`create_cycle_with_results`), plant upsert (`upsert_cycle_plants`) |
| `cycle_import_service.py`      | Parses an uploaded Excel workbook (long format: one row per replicate) into per-cycle groups and calls `cycle_service.create_cycle_with_results` once per cycle found; collects row-level errors and skipped (duplicate-named) cycles without aborting the import |
| `calculations.py`              | Pure functions: `compute_average`, `compute_std` (sample standard deviation), `compute_removal`, `round_or_none` — the authoritative statistics engine, mirrored client-side in `frontend/lib/calculations.ts` for live preview only |
| `raw_data_service.py`          | Paginated/filtered reads of `raw_sensor_data` (`get_raw_data`, `get_raw_data_by_set`, `get_latest_raw_data`, `count_raw_data`) |
| `alert_service.py`             | `no_data`/`capture_failure` detectors, threshold get/set (`get_threshold`/`set_threshold`, backed by the `alert_config` singleton row), alert listing/filtering (`list_alerts`), and the still-unimplemented `detect_anomalies()` placeholder (always returns `[]`) |
| `notification_service.py`      | `notify_new_alert()` — fires optional email (`smtplib`) and Telegram (Bot API via `requests`) notifications when an alert newly becomes active; failures are caught and logged, never propagated |

## 8. Database models (`app/models/`)

Nine SQLAlchemy ORM classes, with the database schema created by the
consolidated Alembic migration `0001_initial_consolidated.py` (see §9 below):

| Model class          | Table                 | Notes                                                                                   |
|------------------------|------------------------|----------------------------------------------------------------------------------------------|
| `Study`                  | `studies`               | Root entity; `raw_sensor_data` (1-to-many, cascade delete-orphan) and `cycles` (many-to-many, viewonly, via `study_cycles`) |
| `RawSensorData`          | `raw_sensor_data`        | `study_id` nullable, `ON DELETE SET NULL`; unique on `(entry_id, set_number)`                 |
| `Cycle`                  | `cycles`                 | **No `study_id` column** — see §9. `results` (1-to-many, cascade), `plants` (1-to-1, cascade), `studies` (many-to-many, viewonly, via `study_cycles`) |
| `StudyCycle`             | `study_cycles`           | Many-to-many association table between `Study` and `Cycle`; both FKs `ON DELETE CASCADE` (removes only the association row); unique on `(study_id, cycle_id)` |
| `CyclePlants`            | `cycle_plants`           | At most one row per cycle (`cycle_id` unique); `plant_1/2/3`; never mixed into `cycle_results` |
| `CycleResult`            | `cycle_results`          | One row per `(parameter, stage_role)` per cycle; `stage` holds the real, persisted label ("Wastewater"/"Planted Series"/"Control Series"), `stage_role` holds the stable internal key (`stage_1/2/3`) used only for the Removal % baseline |
| `SensorAlert`            | `sensor_alerts`          | `alert_type` ∈ `no_data`/`capture_failure`/`anomaly`; `sensor_set` ∈ `"1"`/`"2"`/`"both"`/`NULL`; `status` ∈ `active`/`resolved` |
| `AlertConfig`            | `alert_config`           | Singleton row (`id=1`) holding the runtime-configurable `null_capture_threshold`                |
| `CollectorRunState`      | `collector_run_state`    | One row per sensor set, tracks `consecutive_empty_runs` for the "No Data Collected" detector    |

## 9. Database migrations (Alembic)

The project uses a single consolidated Alembic migration, applied by
`alembic upgrade head`:

1. **`0001_initial_consolidated.py`** — creates the final database schema
   directly, including the nine application tables:
   `studies`, `raw_sensor_data`, `cycles`, `study_cycles`, `cycle_plants`,
   `cycle_results`, `sensor_alerts`, `alert_config`, and
   `collector_run_state`.

The migration defines the final relationships and constraints used by the
application from the start. In particular, `cycles` has **no `study_id`
column**: the Study↔Cycle relationship is represented directly by the
`study_cycles` many-to-many association table. The migration also defines
the required foreign keys, `ON DELETE CASCADE` / `ON DELETE SET NULL`
rules, unique constraints, and indexes for the final schema.

The migration is intended to initialize a fresh database with the current
schema. There is no longer a `0001 -> 0002 -> 0003` migration chain in the
repository, and no intermediate migration is required when running
`alembic upgrade head` on a fresh database.

## 10. API endpoint reference

No versioning prefix beyond `/api`. Interactive docs at `/docs` /
`/redoc`.

### Health / meta (`app/main.py`)

| Method & path        | Purpose                                              |
|------------------------|----------------------------------------------------------|
| `GET /`                  | Healthcheck                                             |
| `GET /api/sensor-sets`    | Currently configured sensor sets                       |
| `GET /api/scheduler`      | Scheduler status + next run time per job               |
| `POST /api/collect`       | Trigger an immediate manual ThingSpeak collection       |

### Raw sensor data (`app/routes/raw_data.py`, prefix `/api/raw-data`)

| Method & path                    | Purpose                                                   |
|-------------------------------------|------------------------------------------------------------------|
| `GET /api/raw-data`                   | Paginated list, optional `set_number` filter, `skip`/`limit`      |
| `GET /api/raw-data/latest`             | Most recent reading (per set, or for one `set_number`)            |
| `GET /api/raw-data/set/{set_number}`   | Paginated list for one sensor set                                  |

### Studies (`app/routes/study.py`, prefix `/api/study`)

| Method & path                                       | Purpose                                                                                     |
|--------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| `POST /api/study`                                        | Create a study                                                                                     |
| `GET /api/study`                                          | List studies (`skip`/`limit`)                                                                       |
| `GET /api/study/export`                                    | CSV export of `raw_sensor_data` filtered by date range + `set_number`                                |
| `GET /api/study/{study_id}`                                 | Study detail                                                                                        |
| `POST /api/study/{study_id}/assign`                          | Assign existing `raw_sensor_data` rows (in the study's date range, `set_number`) to the study        |
| `DELETE /api/study/{study_id}`                               | Permanently delete the study; cascades only over its `study_cycles` rows (cycles/results/plants preserved); `raw_sensor_data.study_id` set to `NULL` |
| `GET /api/study/{study_id}/cycles`                            | List cycles currently associated with this study                                                   |
| `POST /api/study/{study_id}/cycles/{cycle_id}/import`          | "Import Existing Cycle" — attach an already-existing cycle to this study (`409` if already attached) |
| `DELETE /api/study/{study_id}/cycles/{cycle_id}`               | Remove (unassign) a cycle from this study without deleting it                                        |
| `POST /api/study/{study_id}/cycles/import`                      | Bulk-create cycles from an uploaded `.xlsx`/`.xls` file                                              |

### Cycles (`app/routes/cycle.py`)

| Method & path                            | Purpose                                                                                     |
|----------------------------------------------|-----------------------------------------------------------------------------------------------------|
| `GET /api/meta`                                | Canonical parameters, units, stage roles, and baseline stage role, for the frontend to render the 24-row table |
| `POST /api/cycles`                               | Create a new cycle (24-row payload + plant names) under a study; creates the cycle **and** its first `study_cycles` link in one request |
| `GET /api/cycles/available-for-import`             | List every cycle in the database, unfiltered, each annotated with the studies currently using it; optional `search` (case-insensitive on `cycle_name`) |
| `GET /api/cycles/{cycle_id}`                         | Cycle detail with its full results table, plant names, and associated studies                        |

There is intentionally **no `DELETE /api/cycles/{id}`**: a Cycle can
never be deleted through the application (see §9).

### Alerts (`app/routes/alerts.py`, prefix `/api/alerts`)

| Method & path             | Purpose                                                                          |
|-------------------------------|----------------------------------------------------------------------------------------|
| `GET /api/alerts`               | List alerts, filterable by `alert_type`, `study_id`, `sensor_set`, `severity`, `status`, `date_from`/`date_to`; paginated |
| `GET /api/alerts/config`         | Get the current consecutive-failure threshold                                            |
| `PUT /api/alerts/config`         | Update the threshold (applies to both `no_data` and `capture_failure` detectors)          |

## 11. Testing

**No automated tests exist.** There is no `tests/` directory, no test
runner in `requirements.txt`, and no test framework configured. A
`.env.test` file is present but nothing in the codebase loads or
references it automatically — treat it as a prepared template rather
than an active part of a test suite. Verify behavior manually via the
running app, the `/docs` Swagger UI, or direct HTTP calls.

## 12. Data flow details

See the [root README](../README.md) §12 and §14 for the full
automatic-ingestion and manual/reused-cycle data flows, including the
startup backfill mechanism, the timezone-conversion rule
(`app/utils/timezone.py::to_utc`, business timezone `settings.TIMEZONE`
→ UTC storage), and the alert lifecycle (threshold crossing → active
alert → optional notification → resolution).

## 13. Error handling

- A global exception handler in `app/main.py` catches any unhandled
  exception, logs full request context, and returns a generic `500`
  body — no internal details are ever leaked to clients.
- Route handlers raise explicit `HTTPException`s for expected failure
  cases: `400` (invalid input — unknown `set_number`, `end_date` before
  `start_date`, non-Excel upload), `404` (study/cycle/association not
  found), `409` (cycle already associated with the target study via
  "Import Existing Cycle").
- Pydantic validation failures surface automatically as `422`.
- Excel import collects row-level errors (`row_errors`) and skipped
  duplicate-named cycles (`cycles_skipped`) in the response body
  instead of aborting the whole import.
- Notification failures (SMTP/Telegram) are caught and logged, never
  propagated — they cannot break the alert pipeline or a collector run.

## 14. Security mechanisms

- **CORS allow-list** via `settings.CORS_ORIGINS`.
- **Parameterized queries / ORM** — all DB access goes through
  SQLAlchemy, avoiding raw string-built SQL.
- **Input validation** — Pydantic schemas enforce the canonical
  parameter/stage vocabulary (`CycleCreate` rejects any payload that
  doesn't cover exactly the 24 expected parameter/stage rows).
- **File-type check** on Excel uploads (`.xlsx`/`.xls` only).
- **No secrets hard-coded** — all credentials/URLs come from
  environment variables (`.env`, `.env.test`, `.env.example` in this
  archive contain placeholder values only; treat a real deployment's
  `.env` as a secret).
- **Not present**: authentication/authorization, rate limiting,
  HTTPS/TLS termination (would need a reverse proxy), CSRF protection.

## 15. Known limitations specific to the backend

See the [root README](../README.md) §22 for the full list (shared with
the frontend). Backend-specific highlights: the anomaly detector
(`alert_service.detect_anomalies`) is a no-op placeholder; a Cycle can
never be deleted once created (no `DELETE /api/cycles/{id}` exists —
only its per-study association can be removed); capture-failure
detection is a simple all-zero heuristic with no drift/out-of-range
detection; and the consolidated Alembic migration (`0001_initial_consolidated.py`)
initializes the current schema on a fresh database. It does not provide an
incremental upgrade path from an external or legacy schema.
