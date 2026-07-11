# Smart Water Quality Monitoring System

A full-stack system for tracking water-quality experiments: automatic sensor
ingestion from ThingSpeak (pH, temperature, EC, turbidity, DO) plus a manual
lab-cycle workflow (Cycle A/B/C/D…), organized around **studies**.

```
├── backend/    FastAPI + PostgreSQL + Alembic + APScheduler (ThingSpeak collector)
└── frontend/   Next.js 15 + React 18 + TypeScript + Tailwind
```

- **Backend README:** [`backend/README.md`](./backend/README.md) — full API
  reference, database/migrations, ThingSpeak collector, workflow examples.
- **Frontend README:** [`frontend/README.md`](./frontend/README.md) — pages,
  components, API client, setup.

This file covers how the two pieces fit together and how to run the whole
system locally.

## Architecture

```
┌─────────────────────┐        HTTP (JSON)        ┌──────────────────────────┐
│   Next.js frontend   │ ─────────────────────────▶ │      FastAPI backend      │
│  (localhost:3000)    │ ◀───────────────────────── │     (localhost:8000)      │
└─────────────────────┘                             └──────────┬───────────────┘
                                                                 │
                                              ┌──────────────────┼──────────────────┐
                                              ▼                                     ▼
                                     PostgreSQL (Alembic-managed)          ThingSpeak API
                                     studies / raw_sensor_data /           (2 sensor channels,
                                     cycles / cycle_results                polled by APScheduler)
```

A **study** is the top-level container for one experimental campaign
(e.g. "Constructed Wetland Pilot — Summer 2026"). It groups:
- **Raw sensor data** — automatically collected from ThingSpeak every
  `COLLECTOR_INTERVAL_MINUTES`, linked to a study via `study_id`.
- **Cycles** — manually entered lab treatment cycles (24 rows each),
  with removal-percentage and mean/std results computed server-side.

## Quick start (both services)

Requires: Python 3.11+, PostgreSQL, Node.js 18+.

```bash
# 1. Backend
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # set DATABASE_URL, ThingSpeak keys
createdb water_quality_db
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. Frontend (new terminal)
cd frontend
cp .env.local.example .env.local                   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

- Backend: http://localhost:8000 (docs at `/docs`)
- Frontend: http://localhost:3000

## CORS

The frontend calls the backend from a different origin, so the backend must
send CORS headers or the browser blocks every request (this was previously a
bug — see "Known fixes" below). `app/config.py` exposes `CORS_ORIGINS`
(defaults to `http://localhost:3000` and `http://127.0.0.1:3000`); override it
in `backend/.env` if you deploy the frontend elsewhere:

```
CORS_ORIGINS=["http://localhost:3000","https://your-prod-domain.com"]
```

## Known fixes already applied in this codebase

- **CORS middleware** was missing from `app/main.py`, causing `OPTIONS`
  preflight requests to fail with `405` and the frontend to show
  `"Failed to fetch"`. Fixed by registering `CORSMiddleware`.
- **Migration `0002` downgrade bug**: the raw SQL backfill referenced the
  unquoted column `do`, a reserved PostgreSQL keyword, breaking
  `alembic downgrade`. Fixed by quoting it as `"do"`.
- **Migration drift**: models declare `index=True` on `id`, but no migration
  created that index, so `alembic revision --autogenerate` never produced a
  clean diff. Fixed by migration `0003_add_missing_id_indexes`.

## Typical end-to-end flow

1. Create a study from the frontend home page (or `POST /api/study`).
2. The backend's scheduler is already collecting ThingSpeak readings in the
   background; assign the relevant set to the study via
   `POST /api/study/{id}/assign?set_number=1`.
3. Log a manual lab cycle from the study page (`/studies/{id}/cycles/new`) —
   this posts all 24 rows in one request to `POST /api/cycles`.
4. View computed results per cycle at `/studies/{id}/cycles/{cycleId}`.
5. Export the study's data as CSV via `GET /api/study/export`.

See `backend/README.md` for the full endpoint reference and curl examples.
