# Water Quality Monitoring — Frontend

Next.js 15 (App Router) + React 18 + TypeScript + Tailwind dashboard for
managing studies and lab cycles, talking to the FastAPI backend in
`../backend`.

## 1. Stack

| Layer      | Choice                              |
|------------|--------------------------------------|
| Framework  | Next.js 15 (App Router, `"use client"` pages) |
| Language   | TypeScript                          |
| Styling    | Tailwind CSS                        |
| Data       | `fetch` via a small typed client in `lib/api.ts` — no external data-fetching library |

## 2. Project structure

```
frontend/
├── app/
│   ├── layout.tsx                          # Root layout
│   ├── page.tsx                            # "/" — list + create studies
│   └── studies/
│       └── [studyId]/
│           ├── page.tsx                    # Study detail: raw data + cycles list
│           └── cycles/
│               ├── new/page.tsx            # Create a cycle (24-row form)
│               └── [cycleId]/page.tsx      # Cycle detail (computed results table)
├── components/
│   ├── CycleTable.tsx                      # Editable/display table for the 24 cycle rows
│   ├── NumberCell.tsx                      # Formatted numeric cell (mean/std/removal %)
│   └── RemovalBadge.tsx                    # Color-coded removal-percentage badge
├── lib/
│   ├── api.ts                              # Typed fetch client for the backend API
│   ├── calculations.ts                     # Client-side helpers (mirrors backend calc logic for live preview)
│   ├── constants.ts                        # Cycle parameter/step definitions
│   └── types.ts                            # Shared TS types (Study, Cycle, CycleSummary, …)
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## 3. Setup

Requires Node.js 18+.

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Runs at http://localhost:3000. It expects the backend to already be running
(see `../backend/README.md`).

## 4. Environment variables

| Variable               | Description                                  | Default                 |
|-------------------------|-----------------------------------------------|--------------------------|
| `NEXT_PUBLIC_API_URL`   | Base URL of the FastAPI backend                | `http://localhost:8000` |

## 5. Pages

| Route                                   | Purpose                                                            |
|-------------------------------------------|----------------------------------------------------------------------|
| `/`                                      | List all studies, create a new one                                  |
| `/studies/[studyId]`                     | Study detail — assign raw sensor data, list cycles, export CSV      |
| `/studies/[studyId]/cycles/new`          | Enter a new lab cycle (24 rows, one POST to the backend)            |
| `/studies/[studyId]/cycles/[cycleId]`    | View a cycle's computed results (mean, std, removal %)              |

## 6. API client (`lib/api.ts`)

All backend calls go through a single typed `api` object:

```ts
api.listStudies()
api.createStudy({ study_name, plant_type, start_date, end_date? })
api.getStudy(studyId)
api.listCycles(studyId)
api.getCycle(cycleId)
api.createCycle(payload)          // posts cycle metadata + all 24 rows in one request
api.assignRawData(studyId, setNumber)
```

It reads `NEXT_PUBLIC_API_URL`, sends JSON, and throws on non-2xx responses
with the response body/status in the error message (surfaced in the UI, e.g.
"Couldn't reach the API: …").

## 7. Notes

- Route paths intentionally use `/api/study` (singular) to match the merged,
  study-centric backend — not the older `/api/studies` (plural) endpoints
  from a previous standalone service; see the comment in `lib/api.ts`.
- If you see `"Couldn't reach the API"` / `Failed to fetch` in the browser,
  it's almost always one of: backend not running, wrong
  `NEXT_PUBLIC_API_URL`, or missing CORS configuration on the backend (see
  the root `README.md`, "CORS" section).
