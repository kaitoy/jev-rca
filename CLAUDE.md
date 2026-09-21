# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```sh
mise install            # Node 24 (required, since we use node:sqlite) + pnpm
pnpm install
cp .env.example .env    # set TYPESAFE_API_KEY
```

## Commands

```sh
pnpm dev                # vite dev --port 3000
pnpm test               # node --test src/**/*.test.ts
pnpm typecheck          # tsc --noEmit
pnpm build
pnpm generate-routes    # tsr generate (run after adding/removing files in src/routes/)
```

- Run a single test file: `node --test src/server/rca.test.ts`
- Tests use `node:test` + `node:assert/strict`. The DB is seeded in-memory via `openDb(':memory:')` for verification (see `src/server/rca.test.ts`).

## Architecture

Stack: TanStack Start (React 19 + file-based TanStack Router) on Vite, Tailwind v4, `node:sqlite` (no external DB driver), `@typesafe-ai/sdk` (Jev), Zod.

### Data model and RCA flow

The schema (`ci` / `relation` / `service` / `service_ci` / `event` / `analysis` / `analysis_candidate`) lives in a single SQLite file, defined in `src/db.ts`. `getDb()` is a singleton connection; the location can be changed via the `DB_PATH` env var (default `./data/jev-rca.db`).

RCA analysis (`runAnalysis`, `src/server/analysis.ts`) runs in this order:
1. Pick one target event
2. Gather candidates within the time window (`src/server/rca.ts:gatherCandidates`): the same CI, upstream CIs found by BFS over `relation.from_ci -> to_ci` (`upstreamOf`), or CIs in the same service
3. Send one `choice` question to Jev per candidate, in parallel (`RELATION_QUESTION`: root_cause / co_symptom / unrelated). Candidates are sent as independent requests rather than bundled into one question, to keep each judgment focused instead of overflowing the context
4. If two or more candidates tie for the top `P(root_cause)` bucket with verdict `root_cause` (Jev returns close to 1.0 across an entire causal chain), send one more `choice` question (`ORIGIN_QUESTION`, `buildOrigin`) with the tied candidates as its options, asking which is the origin. `tiedRootCauses` buckets with `toFixed(1)` so it matches SQLite `round(p, 1)`
5. Save each candidate to `analysis_candidate` along with `P(root_cause)`, `p_origin` (NULL when not tied), etc., and rank with `RANK_ORDER` (`round(p_root_cause, 1) DESC, p_origin DESC, hops DESC, delta_seconds ASC`). Remaining ties are broken by preferring the more upstream event, then the earlier one

Jev is weak at comparing dates or counting hops, so instead of passing raw numbers, `describeTiming` / `describeTopology` (`src/server/rca.ts`) turn them into natural-language sentences before putting them in the state.

### Server functions

`src/server/*.ts` has no separate API/router layer — route loaders/components call the TanStack `createServerFn` handlers directly.
- `cmdb.ts` — CRUD for CI / relation / service
- `events.ts` — CRUD for events
- `import.ts` — bulk JSON import (transactional, reuses the same upsert pattern as `cmdb`/`events`)
- `analysis.ts` — running, listing, and fetching analyses
- `rca.ts` — candidate gathering and building the state/question sent to Jev
- `env.ts` — `.env` loader. Unlike `process.loadEnvFile()`, it also fills in keys that already exist as empty strings (because the Vite dev server can load them with empty values first)

### Routing and UI

`src/routes/` is file-based routing. `src/routeTree.gen.ts` is generated — don't edit it by hand; run `npm run generate-routes` after adding or removing route files.

`src/components/ui.tsx` provides shared UI parts (`Shell` / `Button` / `DataTable` / `Badge` / `Field` / `PageHeader` / `SectionCard` / `DetailList`, etc.) that follow the tokens defined in `DESIGN.md` (glassmorphism, accent colors, etc.). Check here for reuse before writing new markup. Read `DESIGN.md` before touching the UI.

The path aliases `#/*` and `@/*` both point to `./src/*`.

UI copy and error messages are in English. Keep any newly added copy consistent with that.
