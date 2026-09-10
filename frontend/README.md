# Water Quality Monitoring — Frontend

Next.js (App Router) dashboard for creating/deleting studies, entering,
importing, and reusing laboratory cycle results, and monitoring sensor
alerts. It talks exclusively to the FastAPI backend in `../backend`
over HTTP/JSON.

For the system-wide picture (data flow, database schema, full API
reference) see the [root README](../README.md); for backend setup and
internals see [`backend/README.md`](../backend/README.md).

## 1. Technology stack

| Concern       | Technology                                                        |
|----------------|--------------------------------------------------------------------|
| Framework       | Next.js 15.5 (App Router, client components — every page is `"use client"`) |
| UI library      | React 18                                                          |
| Language        | TypeScript 5 (strict mode)                                        |
| Styling         | Tailwind CSS 3, with a small custom design-token palette (see `tailwind.config.ts`) |
| Data fetching   | Native `fetch`, wrapped in a small typed client (`lib/api.ts`) — no React Query, SWR, Axios, or Redux |
| Fonts           | `Inter` (sans) / `JetBrains Mono` (mono), referenced via `fontFamily` in Tailwind config (loaded as system/web fonts, not bundled via `next/font` in this codebase) |

There is no server-side rendering of dynamic data in this app: every
page is a client component that fetches from the backend after mount
via `useEffect`.

## 2. Installation and dependencies

Requires Node.js 18+ (Next.js 15 requirement).

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

The app runs at `http://localhost:3000` and expects the backend to
already be reachable (see `../backend/README.md`).

## 3. Environment variables

Read from `.env.local` (see `.env.local.example`):

| Variable                | Purpose                                                                                                                          | Default                  |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------|----------------------------|
| `NEXT_PUBLIC_API_URL`     | Base URL of the FastAPI backend, used by every call in `lib/api.ts`                                                              | `http://localhost:8000`   |
| `NEXT_PUBLIC_TIMEZONE`    | IANA timezone used to format all displayed dates/times and to build `datetime-local` form values (see `lib/format.ts`). Must match the backend's `TIMEZONE` for naive form submissions to round-trip correctly (see root README, "Data flow"). | `Africa/Casablanca`       |

Both variables are read with `process.env.NEXT_PUBLIC_*` and fall back
to the defaults above if unset.

## 4. Pages (App Router)

| Route                                      | File                                              | Purpose                                                                 |
|----------------------------------------------|------------------------------------------------------|------------------------------------------------------------------------------|
| `/`                                           | `app/page.tsx`                                       | List all studies; inline form to create a new study; **delete a study** (with a confirmation dialog) |
| `/studies/[studyId]`                          | `app/studies/[studyId]/page.tsx`                      | Study detail: import cycles from Excel, **reuse an existing cycle** ("Import Existing Cycle"), list cycles currently associated with the study, **remove a cycle from the study** (without deleting it), link to create a new cycle |
| `/studies/[studyId]/cycles/new`               | `app/studies/[studyId]/cycles/new/page.tsx`           | 24-row cycle entry form (plant names + replicates), with live calculation preview |
| `/studies/[studyId]/cycles/[cycleId]`         | `app/studies/[studyId]/cycles/[cycleId]/page.tsx`     | Read-only view of a saved cycle's computed results and plant names            |
| `/alerts`                                     | `app/alerts/page.tsx`                                 | Alert dashboard: configurable threshold, filters, and alert history table     |

Note on deleting a study: `app/page.tsx`'s confirmation dialog currently
says deleting a study "will permanently delete the study and all of its
cycles, cycle results, and cycle plants." This is stricter than what
actually happens — the backend only removes the study's `study_cycles`
associations; the cycles themselves (and their results/plant names) are
preserved and remain usable by any other study. See the root README §22
for this and other known documentation/behavior gaps.

`app/layout.tsx` defines the root layout: a dark header with the app
title and navigation links (`Studies`, `Alerts`) shared by every page.

## 5. Components

| Component                          | File                                    | Role                                                                                          |
|--------------------------------------|-----------------------------------------------|----------------------------------------------------------------------------------------------------|
| `CycleTable`                          | `components/CycleTable.tsx`                | Renders the 24-row parameter × stage table, editable (new-cycle form) or read-only (cycle detail); computes live values while editing via `lib/calculations.ts` |
| `CyclePlantNamesForm`                 | `components/CyclePlantNamesForm.tsx`       | Three text inputs (Plant 1/2/3) for a cycle being created                                        |
| `CyclePlantNamesSummary`              | `components/CyclePlantNamesSummary.tsx`    | Read-only display of a saved cycle's plant names                                                 |
| `NumberCell`                          | `components/NumberCell.tsx`                | Formats a computed numeric value (or `—` if null) with a fixed decimal count                     |
| `RemovalBadge`                        | `components/RemovalBadge.tsx`              | Color-coded pill for `removal_percent` (green ≥ 60%, amber ≥ 30%, red below)                       |
| `ImportExistingCycleModal`            | `components/ImportExistingCycleModal.tsx`  | "Import Existing Cycle" picker: lists every cycle in the database (via `api.listAvailableCyclesForImport`, with client-side `search`), marks cycles already associated with the current study, and attaches the chosen one via `api.importExistingCycle`. Never uploads a file and never clones the cycle, its plants, or its results — it only creates a new Study↔Cycle association, and the same cycle may be attached to several studies at once. |

## 6. Library / services (`lib/`)

| File                | Purpose                                                                                                                                            |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `lib/api.ts`          | Single typed `api` object wrapping every backend call (see §7)                                                                                     |
| `lib/types.ts`         | Shared TypeScript interfaces mirroring the backend's Pydantic schemas (`Study`, `Cycle`, `CycleSummary`, `ImportableCycle`, `CycleResultRow`, `CyclePlants`, `SensorAlert`, `AlertConfig`, `CycleImportResult`, `SensorSet`, etc.). `Cycle`/`ImportableCycle` carry a `studies` array (every study currently associated with that cycle) rather than a single `study_id`, mirroring the backend's many-to-many `study_cycles` model. |
| `lib/constants.ts`     | Canonical parameter list, units, stage roles/labels, and `buildEmptyRows()` for a fresh 24-row form — mirrors backend `app/schemas/cycle.py`         |
| `lib/calculations.ts`  | Client-side mirror of the backend's average/std/removal calculations (`app/services/calculations.py`), used **only** for instant live-preview while typing; the backend recomputes authoritatively on save |
| `lib/format.ts`        | `formatDateTime()` and `toDateTimeLocalValue()` — timezone-aware date formatting using `NEXT_PUBLIC_TIMEZONE` and `Intl.DateTimeFormat`, independent of the viewer's browser timezone |

## 7. Communication with the backend

All backend calls are centralized in `lib/api.ts`, which:

- Builds every URL as `${NEXT_PUBLIC_API_URL}${path}`.
- Sends/expects JSON (`Content-Type: application/json`), except for
  Excel import which sends `multipart/form-data`.
- Uses `cache: "no-store"` on every request (always fetch fresh data,
  no Next.js data cache).
- Throws an `Error` with the HTTP status and response body on any
  non-2xx response; pages catch this and render it inline (e.g.
  *"Couldn't reach the API: ..."*).

Exposed methods and the endpoints they call:

```ts
api.listStudies()                              // GET    /api/study
api.createStudy({ study_name, start_date, end_date? })
                                                // POST   /api/study
api.getStudy(studyId)                          // GET    /api/study/{id}
api.deleteStudy(studyId)                       // DELETE /api/study/{id}
api.listCycles(studyId)                        // GET    /api/study/{id}/cycles
api.getCycle(cycleId)                          // GET    /api/cycles/{id}
api.createCycle(payload)                       // POST   /api/cycles
api.assignRawData(studyId, setNumber)          // POST   /api/study/{id}/assign?set_number=...
api.getSensorSets()                            // GET    /api/sensor-sets
api.listAlerts(filters?)                       // GET    /api/alerts
api.getAlertConfig()                           // GET    /api/alerts/config
api.updateAlertConfig(threshold)               // PUT    /api/alerts/config
api.importCycles(studyId, file, skipDuplicates?) // POST /api/study/{id}/cycles/import
api.listAvailableCyclesForImport(opts?)        // GET    /api/cycles/available-for-import
api.importExistingCycle(studyId, cycleId)      // POST   /api/study/{id}/cycles/{cycleId}/import
api.removeCycleFromStudy(studyId, cycleId)     // DELETE /api/study/{id}/cycles/{cycleId}
```

Notes:

- `api.deleteStudy` returns `void` on the backend's `204 No Content`;
  the `request()` helper's empty-body guard handles this.
- `api.listAvailableCyclesForImport` / `api.importExistingCycle` back
  the `ImportExistingCycleModal` component (§5): the first lists every
  cycle in the database (a permanent, unfiltered repository), the
  second attaches a chosen cycle to a study without cloning anything.
- `api.removeCycleFromStudy` detaches a cycle from a study — it does
  **not** delete the cycle, its results, or its plant names, and any
  other study using the same cycle is unaffected.
- `api.assignRawData` and `api.getSensorSets` exist in the client but
  are not currently called from any page — they are available for
  future UI (or manual/API use) without further backend changes.

Route paths intentionally use `/api/study` (singular) to match the
current backend; this is called out directly in `lib/api.ts` as a
reminder that it differs from an older, unrelated `/api/studies`
(plural) naming.

## 8. Running in development

```bash
cd frontend
npm run dev
```

Starts the Next.js dev server (with Fast Refresh) at
`http://localhost:3000`. The backend must be running and reachable at
`NEXT_PUBLIC_API_URL` (default `http://localhost:8000`), with CORS
configured to allow the frontend's origin (see backend README, CORS
section) — otherwise requests fail with `Failed to fetch` in the
browser console and surface as *"Couldn't reach the API"* in the UI.

## 9. Building for production

```bash
npm run build   # next build — production build + type-check
npm run start   # next start — serves the build on port 3000
```

`npm run lint` runs `next lint`. There is no separate production
environment file in the repository beyond `.env.local.example`; a
production deployment would set `NEXT_PUBLIC_API_URL` (and, if needed,
`NEXT_PUBLIC_TIMEZONE`) to the production backend's URL and timezone
before building.

## 10. Folder structure

```
frontend/
├── app/
│   ├── layout.tsx                                  # Root layout (header/nav)
│   ├── page.tsx                                     # "/" — list + create studies
│   ├── globals.css                                  # Tailwind base styles
│   ├── alerts/
│   │   └── page.tsx                                 # "/alerts" — alert dashboard
│   └── studies/
│       └── [studyId]/
│           ├── page.tsx                             # Study detail: cycles list + Excel import
│           └── cycles/
│               ├── new/page.tsx                     # New-cycle 24-row form
│               └── [cycleId]/page.tsx               # Cycle detail (computed results)
├── components/
│   ├── CycleTable.tsx
│   ├── CyclePlantNamesForm.tsx
│   ├── CyclePlantNamesSummary.tsx
│   ├── ImportExistingCycleModal.tsx
│   ├── NumberCell.tsx
│   └── RemovalBadge.tsx
├── lib/
│   ├── api.ts
│   ├── calculations.ts
│   ├── constants.ts
│   ├── format.ts
│   └── types.ts
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json
└── .env.local.example
```
