# Smart Water Quality System — Cycle Results & Sensor Monitoring

Full-stack application for a water-treatment monitoring lab: it
continuously collects sensor readings from ThingSpeak, organizes them
under experimental "studies", lets lab operators record and calculate
manual treatment "cycles" (raw wastewater vs. planted vs. control
series, across 8 water-quality parameters), supports bulk cycle import
from Excel, lets cycles be shared/reused across multiple studies, and
raises alerts when data collection stops or sensors report clearly
invalid readings.

This document is a full technical overview of the project, built
strictly from the code in `backend/` and `frontend/`. Backend-specific
detail (setup, endpoints, services, database migrations) lives in
[`backend/README.md`](backend/README.md); frontend-specific detail
(pages, components, environment variables) lives in
[`frontend/README.md`](frontend/README.md). This file ties both
together and covers the system as a whole.

## 1. Project overview

The system is composed of two independently run applications:

- **Backend** — a FastAPI service that (a) polls ThingSpeak on a
  schedule to ingest raw sensor data (pH, temperature, EC, turbidity,
  dissolved oxygen) into PostgreSQL, and backfills a channel's entire
  history once at startup, (b) exposes a REST API to manage studies
  and reusable laboratory cycles, (c) computes cycle statistics
  (average, standard deviation, removal %), (d) supports importing
  cycles in bulk from Excel, and (e) detects and records alerts when
  data collection fails or sensors report degenerate readings.
- **Frontend** — a Next.js dashboard that lets an operator create and
  delete studies, enter/import/reuse cycle data, review computed
  results, and monitor/configure alerts, all through the backend's
  REST API.

## 2. Project objectives

Based on what the implementation actually does:

- Continuously and reliably ingest sensor measurements from up to N
  configured ThingSpeak channels ("sensor sets") without manual
  effort, including a full historical backfill of each channel the
  first time the backend starts against it.
- Give lab operators a structured way to record 24-row treatment-cycle
  results (8 parameters × 3 stages) per experimental study, either by
  hand or via a single Excel upload, with the same calculation logic
  applied either way.
- Automatically compute the statistics operators would otherwise
  compute in a spreadsheet: mean, sample standard deviation, and
  removal percentage relative to the untreated (baseline) sample.
- Treat a laboratory Cycle as a **permanent, reusable entity**: once
  created, a cycle is never deleted by the application and can be
  attached to ("Import Existing Cycle") any number of studies at the
  same time, independent of the study it was originally created
  under.
- Detect and surface, without manual monitoring, two concrete failure
  conditions in the sensor pipeline: a total absence of new data, and
  sensors reporting all-zero (clearly invalid) readings — with
  configurable sensitivity and optional email/Telegram notification.
- Keep the plant identity used in an experiment (which species was
  tested) as a first-class, per-cycle fact, independent of the
  experimental measurements themselves.

## 3. Main features

| Feature                                          | Where implemented                                                                 |
|---------------------------------------------------|------------------------------------------------------------------------------------|
| Automatic ThingSpeak data collection                | `backend/app/collectors/collector.py` + APScheduler in `backend/app/main.py`         |
| One-time full-history backfill per sensor set        | `ThingSpeakCollector.run_backfill()` / `backfill_all()`, run once at backend startup   |
| Study management (create/list/view/**delete**)        | `backend/app/routes/study.py`, `frontend/app/page.tsx`, `frontend/app/studies/[studyId]/page.tsx` |
| Deleting a study never deletes its cycles or raw data | `study_service.delete_study` — cascades only over `study_cycles`; `raw_sensor_data.study_id` is set to NULL |
| Assigning raw sensor data to a study                  | `POST /api/study/{id}/assign` (backend only — no dedicated frontend page calls it yet) |
| CSV export of raw sensor data                         | `GET /api/study/export` (backend only — no frontend UI for it yet)                     |
| Manual lab-cycle entry (24-row form)                   | `frontend/app/studies/[studyId]/cycles/new/page.tsx` + `POST /api/cycles`             |
| Cycle result calculations (avg/std/removal)            | `backend/app/services/calculations.py` (authoritative) + `frontend/lib/calculations.ts` (live preview) |
| Bulk cycle import from Excel                           | `POST /api/study/{id}/cycles/import`, `backend/app/services/cycle_import_service.py`  |
| Cycles are permanent and reusable across studies       | `study_cycles` many-to-many association table; cycles can never be deleted (no `DELETE /api/cycles/{id}` exists) |
| "Import Existing Cycle" (attach any cycle to a study)  | `POST /api/study/{id}/cycles/{cycle_id}/import`, `GET /api/cycles/available-for-import`, `frontend/components/ImportExistingCycleModal.tsx` |
| Remove a cycle from a study (unassign, not delete)     | `DELETE /api/study/{id}/cycles/{cycle_id}`, `frontend/app/studies/[studyId]/page.tsx` |
| Per-cycle plant names                                   | `cycle_plants` table, `CyclePlantNamesForm`/`CyclePlantNamesSummary` components         |
| Sensor alert detection (No Data / Capture Failure)      | `backend/app/services/alert_service.py`                                              |
| Configurable alert threshold                            | `GET/PUT /api/alerts/config`, `frontend/app/alerts/page.tsx`                          |
| Email + Telegram alert notifications                    | `backend/app/services/notification_service.py`                                        |
| Alert dashboard with filters                            | `frontend/app/alerts/page.tsx`                                                        |

## 4. Functional architecture

```
                     ┌────────────────────────┐
                     │   ThingSpeak (cloud)    │
                     │  N sensor-set channels  │
                     └───────────┬─────────────┘
                                 │ HTTP GET (full backfill once at
                                 │ startup, then polled every
                                 │ COLLECTOR_INTERVAL_MINUTES)
                                 ▼
                     ┌────────────────────────┐
                     │  Backend: Collector      │
                     │  (APScheduler job)       │
                     └───────────┬─────────────┘
                                 │ upsert (dedup on entry_id+set)
                                 ▼
                     ┌────────────────────────┐        ┌──────────────────────┐
                     │   PostgreSQL database    │◄──────┤  Alert detectors       │
                     │  studies / raw_sensor_data│       │ (No Data / Capture     │
                     │  cycles / cycle_results   │       │  Failure) — write to   │
                     │  cycle_plants / study_cycles│      │  sensor_alerts         │
                     │  (m2m) / alerts             │      └──────────┬───────────┘
                     └───────────┬───────────────┘                   │ email / Telegram
                                 │ REST (JSON)                        ▼
                                 ▼                          (operator notified)
                     ┌────────────────────────┐
                     │   Backend: FastAPI API   │
                     └───────────┬─────────────┘
                                 │ fetch (JSON / multipart)
                                 ▼
                     ┌────────────────────────┐
                     │  Frontend: Next.js UI    │
                     │  Studies / Cycles / Alerts│
                     └────────────────────────┘
                                 ▲
                                 │ browser
                             Operator
```

Two functional flows run largely independently:

1. **Automatic sensor flow**: ThingSpeak → collector (full backfill once,
   then recurring polling) → `raw_sensor_data` → alert detectors →
   (optionally) an operator assigns the readings to a study, or exports
   them as CSV.
2. **Manual/lab-cycle flow**: an operator (via the form, an Excel file,
   or "Import Existing Cycle") attaches a cycle's 24 rows of replicate
   measurements to a study → the backend computes statistics → results
   are persisted and displayed. The same physical cycle can be attached
   to several studies at once and is never deleted by the application.

## 5. Technical architecture

```
┌───────────────────────────┐        HTTP/JSON, CORS-enabled        ┌───────────────────────────┐
│         Frontend            │ ─────────────────────────────────────► │          Backend            │
│  Next.js 15 / React 18 / TS  │ ◄───────────────────────────────────── │  FastAPI / SQLAlchemy 2.0    │
│  Tailwind CSS                │                                        │  APScheduler / pandas         │
│  http://localhost:3000       │                                        │  http://localhost:8000        │
└───────────────────────────┘                                        └─────────────┬─────────────┘
                                                                                      │ SQL (psycopg2)
                                                                                      ▼
                                                                        ┌───────────────────────────┐
                                                                        │        PostgreSQL           │
                                                                        │  (schema managed by Alembic) │
                                                                        └───────────────────────────┘

Backend also makes outbound HTTP calls to:
  - ThingSpeak API (sensor data collection + full-history backfill)
  - SMTP server (optional alert emails)
  - Telegram Bot API (optional alert notifications)
```

There is no message queue, cache layer, or separate microservice: the
backend is a single FastAPI process that both serves the API and runs
the background collector job in the same event loop/process via
APScheduler.

## 6. Complete technology stack

| Layer                | Technology                                                                 |
|------------------------|----------------------------------------------------------------------------|
| Frontend framework       | Next.js 15.5 (App Router), React 18, TypeScript 5                           |
| Frontend styling         | Tailwind CSS 3                                                              |
| Frontend data layer      | Native `fetch` via a typed client (`lib/api.ts`)                            |
| Backend framework        | FastAPI 0.110, Uvicorn 0.27                                                 |
| Backend ORM              | SQLAlchemy 2.0                                                              |
| Backend validation       | Pydantic 2 / `pydantic-settings`                                            |
| Database                 | PostgreSQL (driver: `psycopg2-binary`)                                     |
| Migrations               | Alembic 1.13 (`0001_initial_consolidated.py` — consolidated schema migration; see `backend/README.md` §9) |
| Scheduling                | APScheduler 3.10 (`BackgroundScheduler`, in-process)                        |
| Data processing (backend) | pandas + openpyxl (Excel import/parsing, CSV export)                        |
| Outbound HTTP (backend)   | `requests` (ThingSpeak, Telegram Bot API)                                   |
| Email                     | Python standard library `smtplib` / `email.mime.text`                       |
| Config loading            | `python-dotenv` via `pydantic-settings` (backend `.env`); Next.js built-in `.env.local` handling (frontend) |

## 7. Frontend architecture

The frontend is a Next.js App Router application where **every page is
a client component** (`"use client"`); there is no server-side data
fetching or server actions. Pages call the backend directly from the
browser via the typed client in `lib/api.ts`. State is local
`useState`/`useEffect` per page — there is no global state library.

Key structural elements (see `frontend/README.md` for full detail):

- `app/` — routes, one folder per URL segment, following Next.js file
  conventions (`page.tsx`, dynamic segments `[studyId]`, `[cycleId]`).
- `components/` — six presentational/interactive components shared
  across pages, covering the cycle-results table, plant-name
  inputs/summaries, and the "Import Existing Cycle" picker modal.
- `lib/` — the API client, shared TypeScript types, domain constants
  (parameters/stages, mirroring the backend), calculation helpers used
  only for live client-side preview, and timezone-aware date
  formatting.

## 8. Backend architecture

The backend follows a layered structure: routes → services → models,
with Pydantic schemas validating everything crossing the HTTP
boundary. See `backend/README.md` for the full breakdown of every
module. At a glance:

- `app/main.py` wires together the FastAPI app, CORS, the global
  exception handler, the four route modules, and the APScheduler
  lifecycle (startup: run a one-time full history backfill for every
  sensor set, register + start the recurring collection job, and run
  one regular collection immediately; shutdown: stop the scheduler).
- `app/collectors/collector.py` implements `ThingSpeakCollector`
  (fetch → clean → store), `collect_all()` (the recurring/manual
  collection entry point), and `backfill_all()` (the one-time full
  history entry point used only at startup).
- `app/services/*` hold all business logic: study CRUD/deletion and
  raw-data assignment, CSV export, cycle calculations and persistence,
  cycle reuse ("Import Existing Cycle" / unassign), Excel import
  parsing, alert detection state machines, and notification dispatch.
- `app/models/*` are the SQLAlchemy ORM classes for the 9 database
  tables (see §9).
- `app/schemas/*` define the canonical domain vocabulary
  (`PARAMETERS`, `PARAMETER_UNITS`, `STAGE_ROLES`, `STAGE_LABELS`) as
  well as every request/response shape.

## 9. Database architecture

PostgreSQL, managed by SQLAlchemy models and a single consolidated
Alembic migration, `0001_initial_consolidated.py`. This migration creates
the final database schema directly, including the `study_cycles`
many-to-many association between Study and Cycle. Entity-relationship
summary of the **current** schema:

```
studies
 ├─< raw_sensor_data      (study_id nullable, ON DELETE SET NULL)
 └─<>study_cycles<>─ cycles   (many-to-many association table;
                                both FKs ON DELETE CASCADE — cascading
                                only ever removes the ASSOCIATION row,
                                never a Study or a Cycle)
                       cycles
                         ├─1 cycle_plants   (cycle_id UNIQUE, ON DELETE CASCADE)
                         └─< cycle_results  (cycle_id, ON DELETE CASCADE)

sensor_alerts  → studies (study_id nullable, ON DELETE SET NULL, best-effort context)
alert_config          (singleton row, id = 1)
collector_run_state   (one row per configured sensor set)
```

| Table                 | Key columns (non-exhaustive)                                                                                 |
|------------------------|-----------------------------------------------------------------------------------------------------------------|
| `studies`               | `id`, `study_name`, `start_date`, `end_date`                                                                      |
| `raw_sensor_data`       | `id`, `study_id` (nullable), `created_at`, `entry_id`, `ph`, `temperature`, `ec`, `turbidity`, `do`, `set_number`, `inserted_at`; unique on `(entry_id, set_number)` |
| `cycles`                | `id`, `cycle_name`, `start_date`, `end_date`, `created_at` — **no `study_id` column**; a cycle's studies are found only through `study_cycles` |
| `study_cycles`          | `id`, `study_id` (FK → studies, CASCADE), `cycle_id` (FK → cycles, CASCADE), `created_at`; unique on `(study_id, cycle_id)` — the many-to-many association table |
| `cycle_plants`          | `id`, `cycle_id` (unique), `plant_1`, `plant_2`, `plant_3`                                                        |
| `cycle_results`         | `id`, `cycle_id`, `parameter`, `stage`, `replicate_1/2/3`, `average`, `std`, `removal_1/2/3`, `removal_percent`, `removal_std`, `stage_role` |
| `sensor_alerts`         | `id`, `alert_type`, `sensor_set`, `study_id` (nullable), `consecutive_count`, `severity`, `status`, `message`, `created_at`, `updated_at`, `resolved_at` |
| `alert_config`          | `id` (always 1), `null_capture_threshold`                                                                         |
| `collector_run_state`   | `set_number` (PK), `consecutive_empty_runs`, `updated_at`                                                        |

Two deliberate design choices worth calling out because they recur
throughout the codebase's comments:

- **Plant names are never mixed into experimental result rows.**
  `cycle_results` has no plant column at all; `cycle_plants` is a
  separate, at-most-one-row-per-cycle table, and the relationship is
  expressed purely through foreign keys (`cycle_plants.cycle_id →
  cycles.id`, `cycle_results.cycle_id → cycles.id`) — never through the
  imported Excel file and never by duplicating a plant name across 24
  result rows.
- **A Cycle is a permanent, independent entity, not owned by a single
  Study.** Cycles have no `study_id` column; the Study<->Cycle
  relationship lives entirely in the `study_cycles` association table,
  so the same Cycle (and its `cycle_results`/`cycle_plants`) can be
  used by several Studies simultaneously, is never duplicated, and is
  never deleted — deleting a Study only removes its `study_cycles`
  rows (see §14, "Deleting a study").

All timestamps are stored as UTC-aware `TIMESTAMP WITH TIME ZONE`
columns; see §12 ("Data flow") for how business-timezone input is
converted.

## 10. API architecture

The API is a conventional REST/JSON API with no versioning prefix
beyond `/api`. Full endpoint reference: `backend/README.md`, §10.
Summary by resource:

| Resource       | Base path                                        | Router file                     |
|-----------------|----------------------------------------------------|-----------------------------------|
| Health / meta     | `/`, `/api/sensor-sets`, `/api/scheduler`, `/api/collect` | `app/main.py`                       |
| Raw sensor data   | `/api/raw-data` (list, `/latest`, `/set/{n}`)        | `app/routes/raw_data.py`            |
| Studies           | `/api/study` (CRUD + delete, `/export`, `/assign`, cycle attach/detach) | `app/routes/study.py`   |
| Cycles            | `/api/cycles`, `/api/cycles/available-for-import`, `/api/meta` | `app/routes/cycle.py`      |
| Alerts            | `/api/alerts`                                        | `app/routes/alerts.py`              |

Request/response bodies are validated with Pydantic schemas
(`app/schemas/*`); validation errors surface as FastAPI's standard
`422 Unprocessable Entity`, domain errors as `400`/`404`/`409`
`HTTPException`s raised explicitly in route handlers (`409` specifically
for re-importing a cycle already associated with the same study), and
anything unexpected as a generic `500` from the global exception
handler (see §19, "Error handling"). Interactive documentation is
auto-generated by FastAPI at `/docs` and `/redoc`.

There is intentionally **no `DELETE /api/cycles/{id}` endpoint**: a
Cycle can never be deleted through the application once created (see
§9 and §14).

## 11. Authentication and authorization

**Not implemented anywhere in this project.** There is no user model,
no login flow, no session/token handling, and no per-endpoint
authorization check in either the backend or the frontend. Every API
endpoint is open to any client able to reach it (subject only to the
CORS origin allow-list, which restricts browser-based callers but not
direct HTTP clients). This is appropriate for a trusted lab/internal
network as currently deployed, but should be treated as a known gap
before any broader exposure (see §19-22, "Known limitations").

## 12. Data flow

### 12.1 Automatic sensor ingestion

1. At backend startup, `backfill_all()` pulls the **entire** available
   ThingSpeak history for every configured sensor set once, paginating
   backward in time from "now" so it isn't capped at ThingSpeak's
   per-request limit (see `backend/README.md` §12 for the full
   mechanism). This runs before the recurring scheduler takes over.
2. APScheduler then triggers `scheduled_collection_job()` every
   `COLLECTOR_INTERVAL_MINUTES` (also run once immediately at startup,
   right after the backfill). For each configured sensor set
   (`settings.SENSOR_SETS`), `ThingSpeakCollector.run()`:
   - Fetches recent feeds from `THINGSPEAK_BASE_URL`.
   - Cleans/normalizes them into a pandas `DataFrame` (renaming
     `field1..field5` to `ph/temperature/ec/turbidity/do`, coercing
     types, dropping rows without a timestamp or entry id).
   - Inserts new rows into `raw_sensor_data` via `INSERT ... ON
     CONFLICT DO NOTHING` keyed on `(entry_id, set_number)` —
     idempotent by construction (the backfill and the recurring
     collector share this same storage path, so a re-run of either
     never produces duplicates).
   - Runs the `no_data` alert detector for that set.
3. Once every configured set has been processed, the `capture_failure`
   detector runs once across all sets together (so it can tell an
   individual-set failure from a simultaneous all-sets failure).
4. Raw data is later, optionally, linked to a study via `POST
   /api/study/{id}/assign` (an in-place `UPDATE ... SET study_id = ...`
   on rows within the study's date range that aren't yet assigned — no
   data is copied or duplicated).

### 12.2 Manual / imported lab cycles

1. An operator either fills in the 24-row form
   (`/studies/[id]/cycles/new`), uploads an Excel workbook
   (`/studies/[id]`, "Import Excel" button), or attaches an
   already-existing cycle to the current study ("Import Existing
   Cycle" button, `ImportExistingCycleModal`).
2. The manual-entry and Excel paths both converge on
   `cycle_service.create_cycle_with_results()`, which creates a brand
   new `Cycle` row plus its first `study_cycles` association row (to
   the study it was created under):
   - The manual form sends one `POST /api/cycles` with the full 24-row
     payload plus plant names, built client-side.
   - The Excel path (`cycle_import_service.import_cycles_from_excel`)
     parses the workbook, groups long-format rows into per-cycle,
     per-(parameter, stage) replicate triples, fills any missing
     parameter/stage pair with nulls, and calls the same function once
     per cycle found in the file.
3. `build_cycle_results()` computes `average`, `std`, and (for
   non-baseline stages) `removal_1/2/3`, `removal_percent`,
   `removal_std` for every row, using `stage_1` of the same parameter
   as the baseline.
4. The `Cycle` and its 24 `CycleResult` rows are persisted, and the
   cycle's plant names (if any) are upserted into `cycle_plants` — a
   completely separate write.
5. **"Import Existing Cycle"** takes a different path entirely: no new
   Cycle, plant, or result rows are created. `GET
   /api/cycles/available-for-import` lists every cycle in the database
   (unfiltered — the permanent repository), and `POST
   /api/study/{id}/cycles/{cycle_id}/import` simply inserts one new
   `study_cycles` row linking the chosen cycle to the current study
   (`409` if that exact link already exists). The same cycle can be
   attached to any number of studies this way.
6. A cycle can be detached from a study (without deleting it) via
   `DELETE /api/study/{id}/cycles/{cycle_id}`, which removes only the
   `study_cycles` row for that pair.
7. The frontend re-fetches and renders the saved cycle
   (`GET /api/cycles/{id}`), or navigates to it directly after creation
   or import.

### 12.3 Timezone conversion

Dates entered through the UI (`datetime-local` inputs) or an Excel
cell are naive (no UTC offset). The backend interprets every naive
datetime as being in `settings.TIMEZONE` (default `Africa/Casablanca`)
and converts it to UTC before storage (`app/utils/timezone.py::to_utc`).
The frontend's `NEXT_PUBLIC_TIMEZONE` must match the backend's
`TIMEZONE` for this round-trip to be consistent — this is a
configuration convention enforced by convention/documentation, not by
the code itself.

## 13. Communication between frontend, backend, and database

- **Frontend ↔ Backend**: plain HTTP over JSON (multipart for the
  Excel upload), same-origin-unaware (CORS-enabled). The frontend never
  talks to PostgreSQL or ThingSpeak directly.
- **Backend ↔ Database**: SQLAlchemy 2.0 Core/ORM over `psycopg2`, one
  connection pool (`pool_size=5`, `max_overflow=10`,
  `pool_pre_ping=True`) shared by the API request path and the
  scheduler's collector job (each request/job gets its own `Session`).
- **Backend ↔ ThingSpeak**: outbound HTTPS GET via `requests`, no
  authentication required for public channels; an optional per-channel
  read API key is supported for private channels (`SENSOR_SETS`
  configuration).
- **Backend ↔ SMTP/Telegram**: outbound, fire-and-forget notifications
  triggered only when an alert newly becomes active.

## 14. Important application workflows

### Creating a study and its first cycle

1. Operator opens `/`, fills in study name + start date (+ optional end
   date), submits → `POST /api/study` → the study list re-fetches.
2. Operator clicks into the new study (`/studies/{id}`), then "+ New
   cycle".
3. Operator names the cycle, sets its date range, optionally fills in
   up to three plant names, and enters replicate values for as many of
   the 24 (parameter, stage) cells as available; the table recomputes
   average/std/removal live in the browser as they type.
4. On "Save cycle", the entire payload is sent in one `POST
   /api/cycles`; the backend validates that all 24 combinations are
   present, computes authoritative statistics, persists the cycle, and
   creates its first `study_cycles` association row to this study.
5. The operator is navigated to the cycle detail page, which reloads
   the saved, backend-computed values from `GET /api/cycles/{id}`.

### Reusing an existing cycle in another study ("Import Existing Cycle")

1. From any study page, the operator clicks "♻️ Import Existing Cycle".
2. The modal fetches `GET /api/cycles/available-for-import` — every
   cycle in the database, each annotated with the list of studies that
   currently use it — optionally filtered by name via `search`.
3. Selecting a cycle calls `POST
   /api/study/{id}/cycles/{cycle_id}/import`, which adds a
   `study_cycles` row without touching the cycle's results or plant
   names. The same cycle now appears under both studies.

### Removing a cycle from a study (not deleting it)

1. From a study's cycle list, the operator clicks the remove/"delete"
   action next to a cycle.
2. This calls `DELETE /api/study/{id}/cycles/{cycle_id}`, which removes
   only that one `study_cycles` association row.
3. The cycle, its results, and its plant names remain in the database
   untouched, and remain visible/attachable from any other study or via
   "Import Existing Cycle" — there is no way to permanently delete a
   cycle through the application.

### Importing cycles from Excel

1. From a study page, the operator clicks "Import Excel" and picks an
   `.xlsx`/`.xls` file.
2. The file is parsed server-side (`pandas.read_excel`), grouped by
   cycle, and validated row by row; invalid rows are collected as
   `row_errors` without stopping the rest of the import; cycles whose
   name already exists for the study are skipped by default.
3. The frontend displays a summary (rows read, cycles created, skipped
   cycles with reasons, row errors) and refreshes the cycle list in
   place.

### Deleting a study

1. From `/`, the operator clicks the delete icon next to a study and
   confirms.
2. `DELETE /api/study/{id}` permanently deletes the `Study` row. By
   database cascade, only its `study_cycles` association rows are
   removed — every cycle it used (and that cycle's `cycle_results` /
   `cycle_plants`) remains fully intact and reusable by any other
   study. The study's `raw_sensor_data` rows are never deleted either:
   their `study_id` is simply set back to `NULL` (unassigned).
3. The study disappears from the list immediately, with no full page
   reload.

### Alert lifecycle

1. Each collector run evaluates `no_data` (per set) and
   `capture_failure` (per set, plus a combined "both/all" case)
   independently, comparing a running consecutive-failure count against
   the configured threshold `N`.
2. Once a count reaches `N`, an alert row is created with
   `status="active"` and `severity="warning"`; if it keeps growing
   beyond `N` it becomes `severity="critical"`.
3. On the transition to a *new* active alert only, `notify_new_alert()`
   fires the email and Telegram channels (each independently optional).
4. Once the underlying condition clears (new data arrives; a capture
   with a non-zero reading appears), the active alert is marked
   `resolved` with a `resolved_at` timestamp.
5. Operators view/filter this history and adjust the shared threshold
   from `/alerts` in the frontend.

## 15. Project structure

```
VF_CIRQUA/
├── README.md                 # This file
├── backend/
│   ├── README.md
│   ├── alembic/
│   │   └── versions/          # 0001_initial_consolidated
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── collectors/
│   │   ├── database/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── utils/
│   ├── logs/
│   ├── requirements.txt
│   ├── .env.example
│   └── .env.test
└── frontend/
    ├── README.md
    ├── app/
    ├── components/
    ├── lib/
    ├── next.config.js
    ├── tailwind.config.ts
    ├── package.json
    └── .env.local.example
```

(See `backend/README.md` §16 and `frontend/README.md` §10 for the fully
expanded per-file trees.)

## 16. Installation and configuration

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL server
- Network access to `api.thingspeak.com` (for live data collection) and,
  optionally, an SMTP relay and/or the Telegram Bot API (for
  notifications)

### Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: at minimum set DATABASE_URL to a real PostgreSQL instance

createdb water_quality_db           # or create the DB by your usual means
alembic upgrade head                # applies the consolidated migration
```

### Frontend setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
# edit .env.local if the backend is not on http://localhost:8000,
# or if TIMEZONE differs from the backend's
```

## 17. Running the complete application

Run backend and frontend as two separate processes (no Docker Compose
or process manager is included in this project):

```bash
# Terminal 1 — backend
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000` (docs at `/docs`, `/redoc`)

Note: on every backend startup, a one-time full-history ThingSpeak
backfill runs before the server starts serving the recurring collector
job (see §12.1) — the first startup against a channel with a long
history may take noticeably longer than subsequent restarts.

For a production-style run: build the frontend (`npm run build && npm
run start`) and run the backend with a production ASGI setup (e.g.
`uvicorn app.main:app --host 0.0.0.0 --port 8000` without `--reload`,
optionally behind a reverse proxy). No Dockerfile, container
orchestration, or process-manager configuration (e.g. systemd unit,
PM2 config) is present in the repository, so any such wrapping is
outside the scope of what currently exists.

## 18. Testing

**No automated tests exist in this project.** There is no `tests/`
directory in the backend, no test runner listed in
`backend/requirements.txt`, and no test files, test runner, or test
script in the frontend's `package.json`. A `.env.test` file exists in
`backend/`, but nothing in the codebase loads or references it
automatically — it appears to be a prepared environment template
rather than an active part of a test suite. Verifying behavior today
means exercising the running application manually (via the UI, the
`/docs` Swagger interface, or direct HTTP calls).

## 19. Error handling

- **Backend**: A global exception handler
  (`app.exception_handler(Exception)` in `app/main.py`) catches any
  unhandled exception, logs it with full request context, and returns a
  generic `500` JSON body so internal details are never leaked to
  clients. Route handlers additionally raise explicit `HTTPException`s
  for expected failure cases: `400` for invalid input (e.g. an unknown
  `set_number`, an `end_date` before `start_date`, a non-Excel upload),
  `404` for missing resources (study/cycle/association not found), and
  `409` for re-importing a cycle already associated with the target
  study. Pydantic schema validation failures are returned automatically
  by FastAPI as `422`. Row-level errors during Excel import are
  collected and returned in the response body (`row_errors`,
  `cycles_skipped`) rather than aborting the whole import.
- **Notifications**: a failure sending an email or Telegram message is
  caught, logged, and never propagated — it cannot break the alert
  detection pipeline or the collector run.
- **Frontend**: every `lib/api.ts` call throws a plain `Error` on a
  non-2xx response (including the response body/status in the message);
  each page's `try/catch` stores this in local state and renders it
  inline (e.g. *"Couldn't reach the API: ..."*, *"Save failed: ..."*)
  rather than crashing the page.

## 20. Security mechanisms

What is actually present:

- **CORS allow-list**: only origins in `settings.CORS_ORIGINS`
  (defaulting to the local Next.js dev origins) can call the API from a
  browser.
- **Parameterized queries / ORM**: all database access goes through
  SQLAlchemy's query builder or ORM, which parameterizes values and
  avoids raw string-built SQL, mitigating SQL injection.
- **Input validation**: Pydantic schemas validate every request body
  and enforce the canonical parameter/stage vocabulary before anything
  reaches persistence logic (e.g. `CycleCreate` rejects a payload that
  doesn't cover exactly the 24 expected parameter/stage rows).
- **File-type check on import**: the Excel upload endpoint rejects any
  filename not ending in `.xlsx`/`.xls` before attempting to parse it.
- **No secrets in code**: SMTP/Telegram credentials and the database
  URL are read from environment variables, not hard-coded (though
  `.env`, `.env.test`, and `.env.example` in this archive do contain
  placeholder/example values — a real deployment should treat its own
  `.env` as a secret and keep it out of version control).

What is **not** present (see also §11 and §21):

- No authentication or authorization on any endpoint.
- No rate limiting or request throttling.
- No HTTPS/TLS termination configured within the application itself
  (would need to be handled by a reverse proxy in front of Uvicorn).
- No CSRF protection (mitigated in practice by the API not using
  cookie-based auth at all, but worth noting as absent rather than
  handled).

## 21. Deployment information

No deployment configuration is present in this repository: there is no
Dockerfile, `docker-compose.yml`, Kubernetes manifest, CI/CD pipeline
definition, or infrastructure-as-code of any kind. Both applications
are designed to be run directly (`uvicorn` for the backend, `next
build`/`next start` for the frontend) against environment variables
supplied via `.env` / `.env.local` files. Any containerization,
process supervision, TLS termination, or cloud deployment would need
to be designed and added separately — it is not part of the current,
finished codebase.

## 22. Known limitations

Directly observable from the code, not speculative:

- **No authentication/authorization** anywhere in the stack (§11, §20).
- **No automated tests** (§18).
- **No deployment tooling** — manual process startup only (§21).
- **Anomaly detection is a placeholder**: `AlertType.ANOMALY` exists in
  the schema and the frontend's alert-type list, and
  `alert_service.detect_anomalies()` has the right signature to be
  wired in later, but it currently always returns an empty list — no
  sensor-value-threshold anomalies are ever actually detected or
  raised.
- **Two UI-adjacent backend features have no frontend page**: assigning
  raw sensor data to a study (`POST /api/study/{id}/assign`) and
  exporting raw sensor data as CSV (`GET /api/study/export`) are fully
  implemented and exposed by the API (and even wrapped in the frontend
  API client for `assignRawData`/`getSensorSets`), but no page in
  `frontend/app` currently calls them.
- **A Cycle can never be deleted through the application**: this is an
  intentional design choice (see §9, §14), but it means an
  accidentally-created cycle with wrong data has no delete path — the
  only remedies are removing it from every study that uses it (it then
  simply becomes an unused, still-importable row) or a direct database
  operation.
- **Capture-failure detection is a simple all-zero heuristic**: a
  capture is only considered failed if every one of its five parameter
  values is exactly `0`. Any other kind of sensor malfunction (e.g.
  a stuck non-zero value, drift, out-of-range readings) is not
  detected by the current logic.
- **Timezone consistency between frontend and backend is by
  convention, not enforcement**: nothing prevents `NEXT_PUBLIC_TIMEZONE`
  and the backend's `TIMEZONE` from being set to different values,
  which would silently produce incorrect date round-tripping for
  manually entered dates.
- **No pagination UI**: the backend supports `skip`/`limit` on list
  endpoints, but the frontend does not currently expose pagination
  controls for studies, cycles, raw data, or alerts — it always
  requests/renders the first page/default limit.
- **The confirmation dialog for deleting a study is worded more broadly
  than what actually happens**: `frontend/app/page.tsx` warns that
  deleting a study "will permanently delete the study and all of its
  cycles, cycle results, and cycle plants," but the backend's cascade
  only ever removes the `study_cycles` association rows — the cycles,
  their results, and their plant names are preserved and remain usable
  by any other study.

## 23. Possible future improvements

Framed explicitly as *not currently implemented* — these are
suggestions, not a description of existing functionality:

- Add an authentication/authorization layer (even a simple API-key or
  reverse-proxy-based scheme) before exposing the system beyond a
  trusted network.
- Implement real sensor-value anomaly detection (e.g. configurable
  min/max thresholds per parameter) to complete the existing
  `AlertType.ANOMALY` placeholder.
- Add automated tests (unit tests for `calculations.py` and the alert
  detectors would be natural first targets, given they are pure/mostly
  pure functions).
- Add frontend pages/actions for the already-implemented "assign raw
  data to study" and "export study CSV" backend endpoints.
- Introduce pagination controls in the UI for large studies/cycle/alert
  lists.
- Add containerization (Dockerfile(s)/Compose) and a CI pipeline to
  make deployment and verification repeatable.
- Correct the study-deletion confirmation copy in the frontend to
  reflect that cycles are preserved, not deleted.

## 24. Conclusion

The project is a complete, working two-tier system: a FastAPI backend
that reliably ingests sensor telemetry (including a one-time full
historical backfill per sensor set), models the study/cycle/alert
domain in PostgreSQL — with cycles as a permanent, many-to-many-reusable
resource independent of any single study — and exposes it over a
documented REST API; and a Next.js frontend that gives lab operators a
focused, spreadsheet-like interface for entering, reviewing, and
reusing cycle results, importing data in bulk, deleting studies safely,
and monitoring collection health. The two halves communicate
exclusively over a well-defined, CORS-enabled JSON API, and the
calculation logic (average, sample standard deviation, removal
percentage) is intentionally duplicated in a controlled way — once
authoritatively on the backend, once for instant feedback in the
browser — so the two never disagree by more than presentation-level
rounding. The main gaps in the current implementation are operational
rather than architectural: there is no authentication, no automated
test suite, and no deployment tooling, all of which are realistic,
well-scoped next steps rather than signs of an unfinished domain model.
